
// 当前的http执行器是cf worker的fetch
// 可以改写成基于xhr或node http request都可以
declare namespace CACHE {
    function put(key: string, value: string, options?: any): Promise<any>
    function get(key: string, type?: string): Promise<any>
}


const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:74.0) Gecko/20100101 Firefox/74.0',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
})

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
    if (CACHE) {
        text = await CACHE.get(url)
        if (text) {
            set(url, text)
            return text
        }
    }
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
    if (CACHE) {
        await CACHE.put(url, text, { expirationTtl: url.substr(-2) === 'js' ? 86400 : 7200 })
    }
    return text
}
