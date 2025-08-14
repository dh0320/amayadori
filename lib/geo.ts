// lib/geo.ts
export function getBrowserLocation(): Promise<{lat:number; lon:number}> {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Geolocation未対応'))
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lon: p.coords.longitude }),
        err => rej(err),
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
      )
    })
  }
  
