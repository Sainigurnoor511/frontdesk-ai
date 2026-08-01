'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'

type IntroPhase = 'mark' | 'wordmark' | 'gradient' | 'done'

export function IntroSequence({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<IntroPhase>('mark')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('wordmark'), 700),
      setTimeout(() => setPhase('gradient'), 1800),
      setTimeout(() => {
        setPhase('done')
        onFinish()
      }, 2800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onFinish])

  if (phase === 'done') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background">
      <AnimatePresence mode="wait">
        {phase === 'gradient' ? (
          <motion.div
            key="gradient"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, hsl(217deg 91% 93%) 0%, hsl(0deg 0% 100%) 70%)',
            }}
          />
        ) : (
          <motion.div
            key="mark"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-0 text-2xl font-semibold"
          >
            <span>F</span>
            <AnimatePresence>
              {phase === 'wordmark' && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  rontdesk.ai
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
