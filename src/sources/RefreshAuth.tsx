import { useEffect, memo } from "react";
import { useAtom } from "jotai";
import { getIdTokenResult } from "firebase/auth";

import {
  projectScope,
  currentUserAtom,
  userSettingsAtom,
} from "@src/atoms/projectScope";

/**
 * Returns true if two sets are equal.
 */
function setEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) {
      return false;
    }
  }
  return true;
}

/**
 * When rendered, sets up listeners to refresh auth token when needed.
 *
 * When auth token is refreshed and it contains different roles, the page is reloaded.
 */
const RefreshAuth = memo(function RefreshAuth() {
  const [userSettings] = useAtom(userSettingsAtom, projectScope);
  const [currentUser] = useAtom(currentUserAtom, projectScope);

  useEffect(() => {
    if (currentUser && userSettings && userSettings.refreshTime) {
      const refreshTime = userSettings.refreshTime;
      getIdTokenResult(currentUser).then((tokenResult) => {
        const oldRoles = new Set((tokenResult.claims.roles as string[]) ?? []);
        const tokenIssueTime = new Date(tokenResult.issuedAtTime).getTime();
        if (refreshTime > tokenIssueTime) {
          getIdTokenResult(currentUser, true).then((newTokenResult) => {
            const newRoles = new Set(
              (newTokenResult.claims.roles as string[]) ?? []
            );
            if (!setEqual(oldRoles, newRoles)) {
              window.location.reload();
            }
          });
        }
      });
    }
    return () => {};
  }, [userSettings, currentUser]);
  return null;
});

export default RefreshAuth;
