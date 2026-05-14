export interface AdminPreferences {
  defaultTemplate: string;
  autoSendEmail: boolean;
  includePublicVerifyLink: boolean;
  showChainProgress: boolean;
  compactDashboard: boolean;
  exportFormat: string;
}

export const SETTINGS_STORAGE_KEY = "blockcertAdminSettings";
export const certificateTemplateOptions = ["completion", "internship", "participation"] as const;

export const normalizeCertificateTemplate = (template?: string) => {
  if (template === "achievement") return "completion";
  return certificateTemplateOptions.includes(template as any) ? String(template) : "completion";
};

export const getCertificateTemplateLabel = (template?: string) => {
  const normalized = normalizeCertificateTemplate(template);
  const labels: Record<string, string> = {
    completion: "Course Completion",
    internship: "Internship",
    participation: "Participation",
  };
  return labels[normalized] || "Course Completion";
};

export const defaultAdminPreferences: AdminPreferences = {
  defaultTemplate: "completion",
  autoSendEmail: true,
  includePublicVerifyLink: false,
  showChainProgress: true,
  compactDashboard: false,
  exportFormat: "xlsx",
};

export const loadAdminPreferences = (): AdminPreferences => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return defaultAdminPreferences;
    const preferences = { ...defaultAdminPreferences, ...JSON.parse(saved) };
    return {
      ...preferences,
      defaultTemplate: normalizeCertificateTemplate(preferences.defaultTemplate),
    };
  } catch {
    return defaultAdminPreferences;
  }
};

export const saveAdminPreferences = (preferences: AdminPreferences) => {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...preferences,
      defaultTemplate: normalizeCertificateTemplate(preferences.defaultTemplate),
    })
  );
};
