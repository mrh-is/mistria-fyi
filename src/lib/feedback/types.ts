export interface ReportableElement {
  category: string;
  displayName: string;
  entityId?: string;
  extra?: Record<string, number | string>;
  page: string;
}
