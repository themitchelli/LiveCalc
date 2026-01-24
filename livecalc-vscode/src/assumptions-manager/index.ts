/**
 * Assumptions Manager Module
 * Exports for Assumptions Manager integration
 */

export * from './types';
export { AuthManager, AMAuthError, disposeAuthManager } from './auth';
export { AssumptionsManagerClient, AMClientError, disposeAMClient } from './client';
export { AMStatusBar } from './status-bar';
export {
  AssumptionHoverProvider,
  parseAssumptionReference,
  findAssumptionReferenceAtPosition,
  ASSUMPTION_REFERENCE_PATTERN,
} from './hover-provider';
export { AssumptionCompletionProvider } from './completion-provider';
export { AssumptionDefinitionProvider, AssumptionDocumentLinkProvider } from './definition-provider';
export { AssumptionDiagnosticProvider } from './diagnostic-provider';
export {
  AssumptionResolver,
  ResolutionError,
  disposeResolver,
  type AssumptionReference,
  type ResolutionResult,
  type FullResolutionResult,
} from './resolver';
