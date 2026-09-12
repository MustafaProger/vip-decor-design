import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "./Motion";
export default function Modal({
  open,
  onClose,
  title,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      const trigger = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const oldOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        dialog.close();
        document.body.style.overflow = oldOverflow;
        trigger?.focus();
      };
    }
  }, [open]);
  return (
    <motion.dialog
      ref={ref}
      initial={false}
      animate={
        open
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: reduced ? 0 : 18, scale: reduced ? 1 : 0.98 }
      }
      transition={{ duration: reduced ? 0 : 0.3, ease }}
      className={"dialog " + className}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="icon-button dialog-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <X size={24} />
      </button>
      {children}
    </motion.dialog>
  );
}
