import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';

interface ScreenSaverProps {
  active: boolean;
  onDismiss: () => void;
}

export function ScreenSaver({ active, onDismiss }: ScreenSaverProps) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    if (active) {
      const p = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 1,
        delay: Math.random() * 5,
        duration: Math.random() * 4 + 3,
      }));
      setParticles(p);
    }
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer overflow-hidden"
          style={{ background: 'hsl(225 25% 4%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={onDismiss}
          onMouseMove={onDismiss}
          onKeyDown={onDismiss}
        >
          {/* Floating particles */}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                background: `hsl(38 100% 56% / ${0.2 + Math.random() * 0.3})`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.7, 0.2],
                scale: [1, 1.5, 1],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}

          {/* Central logo */}
          <motion.div
            className="flex flex-col items-center gap-6 z-10"
            animate={{ scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.div
              className="relative"
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            >
              <div className="h-24 w-24 rounded-full flex items-center justify-center" style={{ background: 'hsl(38 100% 56% / 0.1)', boxShadow: '0 0 60px hsl(38 100% 56% / 0.2)' }}>
                <Shield className="h-12 w-12" style={{ color: 'hsl(38 100% 56%)' }} />
              </div>
            </motion.div>
            <motion.h1
              className="text-3xl font-bold tracking-widest uppercase"
              style={{ color: 'hsl(38 100% 56%)' }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              Prefect Duty
            </motion.h1>
            <motion.p
              className="text-sm tracking-wider"
              style={{ color: 'hsl(var(--muted-foreground))' }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              Move mouse or press any key to continue
            </motion.p>
          </motion.div>

          {/* Ambient rings */}
          {[1, 2, 3].map((ring) => (
            <motion.div
              key={ring}
              className="absolute rounded-full border"
              style={{
                width: ring * 200,
                height: ring * 200,
                borderColor: `hsl(38 100% 56% / ${0.05 / ring})`,
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.1, 0.3],
              }}
              transition={{
                duration: 3 + ring,
                delay: ring * 0.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
