"use client";

// Browser speech-to-text for the agent chat's mic button. `supported` is false wherever speech is missing
// (Firefox) or not allowed (an iframe without allow="microphone", or the person refused), so the mic is
// simply not drawn: never a dead button.
import { useCallback, useEffect, useRef, useState } from "react";

const BLOCKED_KEY = "nh-mic-blocked";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** False inside an iframe whose permissions policy does not allow the microphone. */
function micAllowedHere(): boolean {
  try {
    const d = document as unknown as { featurePolicy?: { allowsFeature?: (f: string) => boolean }; permissionsPolicy?: { allowsFeature?: (f: string) => boolean } };
    const policy = d.permissionsPolicy ?? d.featurePolicy;
    if (policy?.allowsFeature) return policy.allowsFeature("microphone");
  } catch {}
  return true;
}

function wasBlocked(): boolean {
  try {
    return sessionStorage.getItem(BLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export interface SpeechControls {
  /** Draw the mic only when this is true. */
  supported: boolean;
  listening: boolean;
  /** The microphone was refused just now: show the "blocked" line once. */
  blocked: boolean;
  start(): void;
  stop(): void;
  toggle(): void;
}

/**
 * `onText(text, final)` gets everything heard since `start()`, interim words included, each time it changes.
 * The caller puts it in the input; nothing is sent by this hook.
 */
export function useSpeech(onText: (text: string, final: boolean) => void): SpeechControls {
  // False on the server and on first paint, so the markup matches; set after mount.
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setSupported(!!recognitionCtor() && micAllowedHere() && !wasBlocked());
    return () => {
      const r = rec.current;
      rec.current = null;
      if (r) {
        r.onresult = r.onerror = r.onend = null;
        try {
          r.abort();
        } catch {}
      }
    };
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setListening(false);
    try {
      r.stop();
    } catch {}
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    let r: Recognition;
    try {
      r = new Ctor();
    } catch {
      setSupported(false);
      return;
    }
    r.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (rec.current !== r) return;
      let text = "";
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
        if (!e.results[i].isFinal) final = false;
      }
      onTextRef.current(text.replace(/\s+/g, " ").trim(), final);
    };
    r.onerror = (e) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        try {
          sessionStorage.setItem(BLOCKED_KEY, "1");
        } catch {}
        setBlocked(true);
        setSupported(false);
      }
      if (rec.current === r) rec.current = null;
      setListening(false);
    };
    r.onend = () => {
      if (rec.current === r) rec.current = null;
      setListening(false);
    };
    try {
      r.start();
      rec.current = r;
      setListening(true);
    } catch {
      rec.current = null;
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => (rec.current ? stop() : start()), [start, stop]);

  return { supported, listening, blocked, start, stop, toggle };
}
