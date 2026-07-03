import { User } from "@/src/api/client";

export type HomeRoute = "/profile" | "/admin/countries" | "/schools";

export function getHomeRoute(user?: User | null): HomeRoute {
  if (user?.must_reset_password) return "/profile";
  if (user?.role === "admin") return "/admin/countries";
  return "/schools";
}
