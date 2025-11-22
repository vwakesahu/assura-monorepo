'use client';
import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react';
import Preloader from '../components/Preloader';
import Landing from '../components/Landing';
import Projects from '../components/Projects';
import Description from '../components/Description';
import SlidingImages from '../components/SlidingImages';
import Footer from '../components/Footer';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (
      async () => {
        const LocomotiveScroll = (await import('locomotive-scroll')).default
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const locomotiveScroll = new LocomotiveScroll();

        setTimeout(() => {
          setIsLoading(false);
          document.body.style.cursor = 'default'
          window.scrollTo(0, 0);
        }, 2000)
      }
    )()
  }, [])

  return (
    <main>
      <AnimatePresence mode='wait'>
        {isLoading && <Preloader />}
      </AnimatePresence>
      <div id="landing">
        <Landing />
      </div>
      <div id="description">
        <Description />
      </div>
      <div id="projects">
        <Projects />
      </div>
      <div id="sliding-images">
        <SlidingImages />
      </div>
      <div id="footer">
        <Footer />
      </div>
    </main>
  )
}
