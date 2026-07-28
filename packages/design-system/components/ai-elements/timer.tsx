"use client";

import { cn } from "@repo/design-system/lib/utils";
import { generateUniqueIds } from "@repo/design-system/shared/unique";
import { Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type React from "react";
import { useEffect, useState } from "react";

interface TimerProps {
  countType?: "increase" | "decrease";
  initialTime?: number;
  isListening?: boolean;
  isPaused?: boolean;
  isStarted?: boolean;
  isTimerVisible?: boolean;
  onStart?: () => void;
  onStop?: () => void;
}

export function Timer({
  className,
  onStart,
  onStop,
  isListening,
  isStarted,
  isPaused,
  countType = "increase",
  initialTime = 0,
  isTimerVisible = true,
}: React.ComponentProps<"div"> & TimerProps) {
  const [_listening, _setListening] = useState<boolean>(isListening ?? false);
  const [_started, _setIsStarted] = useState<boolean>(isStarted ?? false);
  const [_time, _setTime] = useState<number>(initialTime);
  const [_paused, _setPaused] = useState<boolean>(isPaused ?? false); // new param

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (_listening && !_paused) {
      onStart?.();
      intervalId = setInterval(() => {
        _setTime((t) => (countType === "increase" ? t + 1 : t - 1));
      }, 1000);
    } else if (!_listening) {
      onStop?.();
      _setTime(initialTime);
    }

    return () => clearInterval(intervalId);
  }, [_listening, _paused, countType, initialTime, onStart, onStop]); // include new param

  useEffect(() => {
    _setPaused(isPaused ?? false);
  }, [isPaused]);

  useEffect(() => {
    _setListening(isListening ?? false);
  }, [isListening]);

  useEffect(() => {
    _setIsStarted(isStarted ?? false);
  }, [isStarted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const shouldAnimate = !isPaused && _listening;

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <motion.div
        className="flex items-center justify-center rounded-full border border-black p-2 dark:border-white"
        layout
        transition={{
          layout: {
            duration: 0.4,
          },
        }}
      >
        <div className="flex h-6 w-6 items-center justify-center">
          {_started ? (
            <motion.div
              animate={{
                rotate: [0, 180, 360],
              }}
              className="h-4 w-4 cursor-pointer rounded-sm bg-black dark:bg-white"
              onClick={onStop}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
            />
          ) : (
            <Mic className="text-black dark:text-white" />
          )}
        </div>
        <AnimatePresence mode="wait">
          {_started && (
            <motion.div
              animate={{ opacity: 1, width: "auto", marginLeft: 8 }}
              className="flex items-center justify-center gap-2 overflow-hidden"
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{
                duration: 0.4,
              }}
            >
              {/* Frequency Animation */}
              <div className="flex items-center justify-center gap-0.5">
                {generateUniqueIds(12).map(({ id }, i) => (
                  <motion.div
                    animate={{
                      height: shouldAnimate
                        ? [2, 3 + Math.random() * 10, 3 + Math.random() * 5, 2]
                        : 2,
                    }}
                    className="w-0.5 rounded-full bg-black dark:bg-white"
                    initial={{ height: 2 }}
                    key={id}
                    transition={{
                      duration: shouldAnimate ? 1 : 0.3,
                      repeat: shouldAnimate ? Number.POSITIVE_INFINITY : 0,
                      delay: shouldAnimate ? i * 0.05 : 0,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              {/* Timer */}
              {isTimerVisible && (
                <div className="w-10 text-center text-black text-xs dark:text-white">
                  {formatTime(_time)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
