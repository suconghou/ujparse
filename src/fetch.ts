
// 当前的http执行器是cf worker的fetch
// 可以改写成基于xhr或node http request都可以

const cache = new Map()

const get = (key: string) => {
    const item = cache.get(key)
    if (item) {
        if (item.expire > +new Date()) {
            return item.value
        } else {
            expire()
        }
    }
}

const set = (key: string, value: any, ttl: number = 3600e3) => {
    cache.set(key, { value, expire: +new Date() + ttl })
}

const expire = () => {
    const t = +new Date()
    for (let [k, v] of cache) {
        if (v.expire < t) {
            cache.delete(k)
        }
    }
}

export const ajax = async (url: string): Promise<string> => {
    let text = get(url)
    if (text) {
        return text
    }
    const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:74.0) Gecko/20100101 Firefox/74.0' }
    const init = {
        headers,
        method: 'GET',
        cf: {
            cacheEverything: true,
            cacheTtl: 3600,
            cacheTtlByStatus: { '200-299': 3600, 404: 60, '500-599': 10 }
        }
    } as any
    const r = await fetch(url, init)
    text = await r.text()
    set(url, text)
    return text
}
