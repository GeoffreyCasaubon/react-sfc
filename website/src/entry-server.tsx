import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import App from './App.rsfc'

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url} basename="/react-sfc">
      <App />
    </StaticRouter>
  )
}
