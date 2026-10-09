import { useEffect, useState } from 'react';
import { getAppInfo, type AppInfo } from '../lib/native.ts';

export function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let live = true;
    getAppInfo()
      .then((next) => live && setInfo(next))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, []);

  return info;
}
