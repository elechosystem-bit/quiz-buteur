import { useEffect, useRef, useState } from 'react';

export default function useMatchClock({ kickoff_unix, server_unix_now, elapsed, status } = {}) {
  const [minute, setMinute] = useState(() => {
    if (typeof elapsed === 'number') return Math.max(0, Math.floor(elapsed));
    if (kickoff_unix && server_unix_now) {
      return Math.max(0, Math.floor((server_unix_now - kickoff_unix) / 60));
    }
    return null;
  });

  const [isFinished, setIsFinished] = useState(status === 'FT');
  const [isLive, setIsLive] = useState(status === 'live' || (typeof elapsed === 'number' && status !== 'NS' && status !== 'FT' && elapsed > 0));
  const serverOffsetRef = useRef(0); // server_unix_now - client_now (seconds)
  const intervalRef = useRef(null);

  useEffect(() => {
    // Compute server offset if server now is provided
    if (typeof server_unix_now === 'number') {
      serverOffsetRef.current = server_unix_now - Math.floor(Date.now() / 1000);
    } else {
      serverOffsetRef.current = 0;
    }

    // Initial minute computation
    if (typeof elapsed === 'number') {
      setMinute(Math.max(0, Math.floor(elapsed)));
    } else if (kickoff_unix && typeof server_unix_now === 'number') {
      setMinute(Math.max(0, Math.floor((server_unix_now - kickoff_unix) / 60)));
    } else {
      setMinute(null);
    }

    setIsFinished(status === 'FT');
    setIsLive(status === 'live' || (typeof elapsed === 'number' && elapsed > 0 && status !== 'NS' && status !== 'FT'));

    // If finished -> no ticking
    if (status === 'FT') return;

    // Tick every second to update minute based on server-corrected now
    const tick = () => {
      if (kickoff_unix) {
        const nowClient = Math.floor(Date.now() / 1000);
        const nowServerEstimated = nowClient + serverOffsetRef.current;
        const m = Math.floor((nowServerEstimated - kickoff_unix) / 60);
        setMinute(prev => Math.max(0, m));
      } else if (typeof elapsed === 'number') {
        // derive from elapsed and elapsed's server timestamp if available; approximate with client clock
        setMinute(prev => {
          const base = Math.floor(elapsed);
          // compute additional minutes since server_unix_now if provided
          if (typeof server_unix_now === 'number') {
            const nowClient = Math.floor(Date.now() / 1000);
            const nowServerEstimated = nowClient + serverOffsetRef.current;
            const extra = Math.floor((nowServerEstimated - server_unix_now) / 60);
            return Math.max(0, base + extra);
          }
          return base;
        });
      }
    };

    intervalRef.current = setInterval(tick, 1000);
    // run immediately once
    tick();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [kickoff_unix, server_unix_now, elapsed, status]);

  const minuteDisplay = isFinished ? 'FT' : (minute === null ? null : `${minute}'`);
  return {
    minute,
    minuteDisplay,
    isLive: !isFinished && !!(status === 'live' || minute > 0),
    isFinished,
    serverOffset: serverOffsetRef.current
  };
}