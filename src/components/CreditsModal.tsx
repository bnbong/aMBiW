import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";

type CreditsModalProps = {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CreditsModal({
  open,
  onClose,
  returnFocusRef,
}: CreditsModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    // Focus inside the dialog on open so screen readers and keyboard users
    // land in the right context.
    const id = window.requestAnimationFrame(focusFirst);
    return () => window.cancelAnimationFrame(id);
  }, [focusFirst, open]);

  useEffect(() => {
    if (open) return;
    // On close, hand focus back to the trigger (preferred) or the previously
    // focused element so keyboard navigation continues from where it was.
    const target =
      returnFocusRef?.current ?? previousFocusRef.current ?? null;
    target?.focus?.();
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("aria-hidden"));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="credits-title">Credits & Notice</h2>
        <p>
          3D car model:{" "}
          <a
            href="https://sketchfab.com/3d-models/2021-bmw-m4-competition-d3f07b471d9f4a2c9a2acf79d88a3645"
            target="_blank"
            rel="noopener noreferrer"
          >
            “2021 BMW M4 Competition”
          </a>{" "}
          by Ricy (@ngon_3d), via Sketchfab, licensed under{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution
          </a>
          . Modified for materials, lighting, and web optimization.
        </p>
        <p>
          Engine idle sound: edited from “AUDIO M4 WAV” by Andreabarata /
          Freesound Community. Source: Pixabay and Freesound. Freesound original
          is listed as Creative Commons 0. Edited into a short ambient engine
          loop for this project.
        </p>
        <p>
          Turn signal sound: “BMW Indicator” by The_Cri / Freesound Community.
          Source: Pixabay and Freesound. Edited into a seamless loop for this
          project.
        </p>
        <p>
          This is an unofficial personal ambient web experiment. It is not
          affiliated with, endorsed by, sponsored by, or connected to BMW AG,
          BMW M GmbH, Sketchfab, or the referenced asset creators. All
          trademarks and model names belong to their respective owners.
        </p>
        <p style={{ fontSize: "12px", color: "rgba(232,232,236,0.55)" }}>
          이 사이트는 개인 토이 프로젝트이며 BMW AG, BMW M GmbH, Sketchfab 또는
          에셋 제작자와 제휴, 후원, 보증 관계가 없습니다. 모든 상표와 모델명은
          각 권리자에게 있습니다.
        </p>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          ref={closeButtonRef}
        >
          Close
        </button>
      </div>
    </div>
  );
}
