export const http = {
  post (url: string) {
    return send('POST', url)
  },
}

function send (method: string, url: string) {
  return fetch(url, { method })
}
