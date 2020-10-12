const https = require('https')

const agent = new https.Agent({ keepAlive: true });
const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:74.0) Gecko/20100101 Firefox/74.0' }
const timeout = 5e3

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
        return text.toString()
    }
    text = await httpGet(url)
    set(url, text)
    return text.toString()
}

async function httpGet(url: string): Promise<string> {
    return new Promise((resolve: any, reject: any) => {
        https.get(url, { timeout, headers, agent, }, (res) => {
            const { statusCode } = res;
            let error: Error;
            if (statusCode !== 200) {
                error = new Error(`${url} Status Code: ${statusCode}`);
            }
            if (error) {
                res.resume();
                return reject(error)
            }
            const buf = [];
            res.on('error', reject).on('data', (chunk) => { buf.push(chunk); }).on('end', () => resolve(Buffer.concat(buf)));
        }).on('error', reject);
    })
}