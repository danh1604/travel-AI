export function adminAccess({ loading, error, role, checked, pathname }: { loading: boolean; error: boolean; role: string | null; checked: string; pathname: string }) {
  if (loading || checked !== pathname) return "checking";
  if (error) return "unavailable";
  if (!role) return "login";
  return role === "ADMIN" ? "allowed" : "forbidden";
}
export function adminReturnPath(value?: string) {
  if (!value || !/^\/admin(?:\/[a-zA-Z0-9_-]+)*$/.test(value) || value === "/admin/login" || value.startsWith("/admin/login/")) return "/admin";
  return value;
}
