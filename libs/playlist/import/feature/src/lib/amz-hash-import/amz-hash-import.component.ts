import { Component, inject, output, signal } from '@angular/core';
import {
    AbstractControl,
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    ValidationErrors,
    Validators,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { PlaylistActions } from '@iptvnator/m3u-state';
import { StalkerSessionService } from '@iptvnator/portal/stalker/data-access';
import {
    AmzImportAccount,
    extractAmzImportHash,
    normalizeXtreamServerUrl,
    Playlist,
} from '@iptvnator/shared/interfaces';
import { v4 as uuid } from 'uuid';
import {
    isFullStalkerPortalUrl,
    transformStalkerPortalUrl,
} from '../stalker-portal-import/stalker-portal-url.util';
import { AmzImportService } from './amz-import.service';

function amzHashValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    return extractAmzImportHash(value) ? null : { amzHash: true };
}

/**
 * "Import from AMZ IPTV" — resolves a share hash (or full share URL) from
 * iptv.tutoje.cz into an Xtream Codes or Stalker portal account and creates
 * the playlist through the same store action as the manual import forms. The
 * hash itself is never stored; the resolved credentials become a regular
 * account, indistinguishable from a manually entered one.
 */
@Component({
    imports: [
        FormsModule,
        MatFormFieldModule,
        MatIcon,
        MatInputModule,
        ReactiveFormsModule,
        TranslatePipe,
    ],
    selector: 'app-amz-hash-import',
    templateUrl: './amz-hash-import.component.html',
    styles: [
        `
            :host {
                display: flex;
                margin: 10px;
                justify-content: center;
            }

            form {
                width: 100%;
            }

            .amz-error {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 10px 0;
                color: #f44336;
            }
        `,
    ],
})
export class AmzHashImportComponent {
    readonly addClicked = output<void>();

    readonly form = new FormGroup({
        input: new FormControl('', [Validators.required, amzHashValidator]),
        title: new FormControl(''),
    });

    private readonly amzImportService = inject(AmzImportService);
    private readonly stalkerSessionService = inject(StalkerSessionService);
    private readonly store = inject(Store);

    readonly isLoading = signal(false);
    readonly errorKey = signal<string | null>(null);
    readonly errorDetail = signal<string | null>(null);

    clearForm(): void {
        this.form.reset({ input: '', title: '' });
        this.errorKey.set(null);
        this.errorDetail.set(null);
    }

    async addPlaylist(): Promise<void> {
        if (!this.form.valid || this.isLoading()) {
            return;
        }

        this.isLoading.set(true);
        this.errorKey.set(null);
        this.errorDetail.set(null);

        try {
            const result = await this.amzImportService.resolve(
                this.form.getRawValue().input ?? ''
            );

            if (!result.ok) {
                this.errorKey.set(`HOME.AMZ_IMPORT.ERROR_${result.error.toUpperCase()}`);
                this.errorDetail.set(result.reason ?? null);
                return;
            }

            const created = await this.createPlaylist(result.account);
            if (created) {
                this.addClicked.emit();
            }
        } finally {
            this.isLoading.set(false);
        }
    }

    private async createPlaylist(account: AmzImportAccount): Promise<boolean> {
        const title =
            this.form.getRawValue().title?.trim() ||
            this.deriveTitle(account.server);

        if (account.type === 'xtream') {
            let serverUrl: string;
            try {
                serverUrl = normalizeXtreamServerUrl(account.server);
            } catch {
                this.errorKey.set('HOME.AMZ_IMPORT.ERROR_NETWORK');
                this.errorDetail.set('invalid_server_url');
                return false;
            }
            this.store.dispatch(
                PlaylistActions.addPlaylist({
                    playlist: {
                        _id: uuid(),
                        title,
                        username: account.username,
                        password: account.password,
                        serverUrl,
                        importDate: new Date().toISOString(),
                    } as Playlist,
                })
            );
            return true;
        }

        // Stalker — mirror the manual form: transform the URL and, for full
        // stalker_portal URLs, perform the same handshake before saving.
        const portalUrl = transformStalkerPortalUrl(account.server);
        const isFullPortal = isFullStalkerPortalUrl(account.server);

        let stalkerToken: string | undefined;
        let stalkerAccountInfo: Playlist['stalkerAccountInfo'] | undefined;

        if (isFullPortal) {
            try {
                const authResult = await this.stalkerSessionService.authenticate(
                    portalUrl,
                    account.mac,
                    {}
                );
                stalkerToken = authResult.token;
                if (authResult.accountInfo) {
                    stalkerAccountInfo = {
                        login: authResult.accountInfo.login,
                        expireDate: authResult.accountInfo.expire_date,
                        tariffPlanName:
                            authResult.accountInfo.tariff_plan_name,
                        status: authResult.accountInfo.status,
                    };
                }
            } catch (error) {
                console.error('[AmzImport] Stalker handshake failed:', error);
                this.errorKey.set('HOME.AMZ_IMPORT.ERROR_PORTAL_AUTH');
                return false;
            }
        }

        this.store.dispatch(
            PlaylistActions.addPlaylist({
                playlist: {
                    _id: uuid(),
                    title,
                    macAddress: account.mac,
                    portalUrl,
                    importDate: new Date().toISOString(),
                    isFullStalkerPortal: isFullPortal,
                    stalkerToken,
                    stalkerAccountInfo,
                } as Playlist,
            })
        );
        return true;
    }

    private deriveTitle(server: string): string {
        try {
            return new URL(server).hostname;
        } catch {
            return 'AMZ IPTV';
        }
    }
}
