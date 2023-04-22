import { useEffect, memo } from "react";
import { useAtom } from "jotai";
import { getIdTokenResult } from "firebase/auth";

import {
  projectScope,
  currentUserAtom,
  userSettingsAtom,
} from "@src/atoms/projectScope";

/**
 * When rendered, sets up listeners to refresh auth token when needed.
 */
const RefreshAuth = memo(function RefreshAuth() {
  const [userSettings] = useAtom(userSettingsAtom, projectScope);
  const [currentUser] = useAtom(currentUserAtom, projectScope);

  useEffect(() => {
    if (currentUser && userSettings && userSettings.refreshTime) {
      const refreshTime = userSettings.refreshTime;
      getIdTokenResult(currentUser).then((tokenResult) => {
        const tokenIssueTime = new Date(tokenResult.issuedAtTime).getTime();
        if (refreshTime > tokenIssueTime) {
          currentUser.getIdToken(true);
        }
      });
    }
    return () => {};
  }, [userSettings, currentUser]);
  return null;
});

export default RefreshAuth;
