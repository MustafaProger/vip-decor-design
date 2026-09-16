import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Link } from "react-router-dom";

export const MotionLink = motion.create(Link);
export const ease = [0.22, 1, 0.36, 1] as const;

/** One reveal per section; focus also reveals content reached from a keyboard. */
export function Reveal({
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileFocus={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.08 }}
      transition={{
        duration: reduced ? 0 : 0.35,
        delay: reduced ? 0 : delay,
        ease,
      }}
      {...props}
    />
  );
}

export function PageEntrance({
  children,
  immediate = false,
}: HTMLMotionProps<"div"> & { immediate?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="page-entrance"
      initial={reduced || immediate ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.18, ease }}
    >
      {children}
    </motion.div>
  );
}
