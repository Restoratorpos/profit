import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiPatch } from "@/lib/api/client";
import type { GymSettings, GymSettingsInput, PasswordChange } from "./types";

export const gymKeys = {
  all: ["gym"] as const,
  settings: () => [...gymKeys.all, "settings"] as const,
};

/**
 * The tenant's own row. The shell reads this on every screen — the gym's name
 * is what the topbar says — so it is deliberately long-lived: a name changes
 * about once in a gym's life, and refetching it on every navigation would be a
 * request per screen for a string that never moves.
 */
export const gymSettingsQuery = queryOptions({
  queryKey: gymKeys.settings(),
  queryFn: () => apiFetch<GymSettings>("/gym"),
  staleTime: 5 * 60 * 1000,
});

export const useGymSettings = () => useQuery(gymSettingsQuery);

export const useSaveGymSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GymSettingsInput) =>
      apiPatch<GymSettings>("/gym", input),
    // The response is the saved row, so the cache is written rather than
    // invalidated: the topbar's name updates on the same tick as the form's,
    // with no refetch in between showing the old one.
    onSuccess: (settings) =>
      queryClient.setQueryData(gymKeys.settings(), settings),
  });
};

/**
 * Nothing to invalidate: the session's identity does not change with the
 * password, and the tokens already issued stay valid.
 */
export const useChangePassword = () =>
  useMutation({
    mutationFn: (input: PasswordChange) =>
      apiPatch<void>("/auth/password", input),
  });
