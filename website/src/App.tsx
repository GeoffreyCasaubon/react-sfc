import '../app/globals.css'
import Hero from './components/Hero.rsfc'
import Features from './components/Features.rsfc'
import SyntaxDemo from './components/SyntaxDemo.rsfc'
import GettingStarted from './components/GettingStarted.rsfc'
import VSCodeSection from './components/VSCodeSection.rsfc'
import Footer from './components/Footer.rsfc'

export default function App() {
  return (
    <>
      <Hero />
      <Features />
      <SyntaxDemo />
      <GettingStarted />
      <VSCodeSection />
      <Footer />
    </>
  )
}
