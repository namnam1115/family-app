let promise = null

export function loadGoogleMapsScript() {
  if (promise) return promise
  if (window.google?.maps) return Promise.resolve()
  promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // loading=async を指定、libraries は importLibrary() で個別ロード
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&loading=async`
    script.async = true
    script.onload = resolve
    script.onerror = () => {
      promise = null
      reject(new Error('Google Maps の読み込みに失敗しました'))
    }
    document.head.appendChild(script)
  })
  return promise
}
