export interface ReleaseAsset {
  filename: string;
  architecture: string;
  minimumOs?: string;
  size?: string;
}

export interface ReleaseAssets {
  windows: ReleaseAsset;
  appImage: ReleaseAsset;
  deb: ReleaseAsset;
}

export interface Checksums {
  windows: string;
  appImage: string;
  deb: string;
}

export interface SmartDMConfig {
  productName: string;
  version: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  license: string;
  releaseAssets: ReleaseAssets;
  checksums: Checksums;
  links: {
    documentation: string;
    discussions: string;
    issuesBug: string;
    issuesFeature: string;
    security: string;
    license: string;
    contributing: string;
  };
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  role: 'Admin' | 'Contributor' | 'User';
  emailVerified?: boolean;
}

export interface ReleaseConfig {
  version: string;
  releaseDate: string;
  isCurrent: boolean;
  notes: string;
  githubRepo?: string;
  downloads: {
    windows: string;
    appImage: string;
    deb: string;
  };
  sha256: {
    windows: string;
    appImage: string;
    deb: string;
  };
  assets?: {
    windows: string;
    appImage: string;
    deb: string;
  };
}

export type FeedbackType = 'bug' | 'feature' | 'general';
export type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'closed' | 'submitted' | 'under_review' | 'in_progress';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FeaturePriority = 'low' | 'medium' | 'high' | 'nice_to_have' | 'important' | 'must_have';

export interface AdminResponse {
  id?: string;
  responderUid?: string;
  responderName?: string;
  adminName?: string;
  adminEmail?: string;
  message?: string;
  content?: string;
  timestamp?: string;
  createdAt?: string;
}

export interface UserFeedbackItem {
  id: string;
  uid?: string;
  userId?: string;
  userEmail: string;
  userName: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  severity?: FeedbackSeverity;
  priority?: FeaturePriority;
  referenceId?: string;
  actualBehavior?: string;
  expectedBehavior?: string;
  stepsToReproduce?: string;
  proposedSolution?: string;
  problemStatement?: string;
  os?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
  upvotes?: number;
  upvotedBy?: string[];
  adminResponse?: string;
  adminResponses?: AdminResponse[];
}

export interface AuditLogItem {
  id: string;
  action: string;
  performedByUid: string;
  performedByName: string;
  details: any;
  timestamp: string;
}
