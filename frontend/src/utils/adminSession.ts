export const ADMIN_USER_REFRESH_EVENT = "blockcert-admin-user-updated";

export const saveAdminUserSession = (adminUser: unknown) => {
  localStorage.setItem("adminUser", JSON.stringify(adminUser));
  window.dispatchEvent(
    new CustomEvent(ADMIN_USER_REFRESH_EVENT, { detail: adminUser })
  );
};

export const clearAdminSession = () => {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.dispatchEvent(new CustomEvent(ADMIN_USER_REFRESH_EVENT));
};
