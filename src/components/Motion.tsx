import { useState } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Link } from "react-router-dom";

export const MotionLink = motion.create(Link);
export const ease = [0.22, 1, 0.36, 1] as const;

/** Each block reveals once; keyboard focus makes its children visible immediately. */
export function useRevealMotion(delay = 0) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    "data-motion-reveal": "",
    initial: reduced ? (false as const) : { opacity: 0, y: 28 },
    animate: visible || reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 },
    onViewportEnter: () => setVisible(true),
    onFocusCapture: () => {
      setFocused(true);
      setVisible(true);
    },
    viewport: { once: true, amount: 0.12, margin: "0px 0px -24px 0px" },
    transition: {
      duration: reduced || focused ? 0 : 0.65,
      delay: reduced || focused ? 0 : delay,
      ease,
    },
  };
}

export function Reveal({
  delay = 0,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number }) {
  return <motion.div {...useRevealMotion(delay)} {...props} />;
}

export function RevealSection({
  delay = 0,
  ...props
}: HTMLMotionProps<"section"> & { delay?: number }) {
  return <motion.section {...useRevealMotion(delay)} {...props} />;
}

export function RevealArticle({
  delay = 0,
  ...props
}: HTMLMotionProps<"article"> & { delay?: number }) {
  return <motion.article {...useRevealMotion(delay)} {...props} />;
}

export function RevealItem({
  delay = 0,
  ...props
}: HTMLMotionProps<"li"> & { delay?: number }) {
  return <motion.li {...useRevealMotion(delay)} {...props} />;
}

export function RevealLink({
  delay = 0,
  ...props
}: React.ComponentProps<typeof MotionLink> & { delay?: number }) {
  return <MotionLink {...useRevealMotion(delay)} {...props} />;
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
      transition={{ duration: reduced ? 0 : 0.3, ease }}
    >
      {children}
    </motion.div>
  );
}
