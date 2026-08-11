import type { GithubRepositoryMetadataV1, ProviderRequestContextV1 } from '@platform/contracts'
import type { GithubAppOnboardingPort } from '@platform/domain'

export interface GithubInstallationClient {
  inspectRepository(
    context: ProviderRequestContextV1,
    installationId: string,
    repositoryId: string,
  ): Promise<{ readonly accessible: boolean; readonly metadata?: GithubRepositoryMetadataV1 }>
}

export class GithubAppAdapter implements GithubAppOnboardingPort {
  constructor(
    private readonly appSlug: string,
    private readonly installationClient: GithubInstallationClient,
  ) {
    if (!/^[a-z0-9-]+$/u.test(appSlug)) throw new Error('GitHub App slug is invalid.')
  }

  initiateInstallation(
    _context: ProviderRequestContextV1,
    request: { readonly returnUrl: string; readonly state: string },
  ): Promise<{ readonly authorizationUrl: string }> {
    // GitHub returns to the App's configured Setup URL. The validated return URL is
    // retained with the one-time attempt, never sent as repository/provider authority.
    void new URL(request.returnUrl)
    const url = new URL(`https://github.com/apps/${this.appSlug}/installations/new`)
    url.searchParams.set('state', request.state)
    return Promise.resolve({ authorizationUrl: url.toString() })
  }

  verifyRepository(
    context: ProviderRequestContextV1,
    selection: { readonly installationId: string; readonly repositoryId: string },
  ) {
    return this.installationClient.inspectRepository(
      context,
      selection.installationId,
      selection.repositoryId,
    )
  }
}
