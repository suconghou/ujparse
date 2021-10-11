const https = require('https')

const agent = new https.Agent({ keepAlive: true });
const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:74.0) Gecko/20100101 Firefox/74.0',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
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

export const doPost = async (url: string, body: string, cacheKey: string): Promise<string> => {
    let text = get(cacheKey)
    if (text) {
        return text.toString()
    }
    text = await httpPost(url, body)
    set(cacheKey, text)
    return text.toString()
}

async function httpGet(url: string): Promise<string> {
    return new Promise((resolve: any, reject: any) => {
        let times = 0
        const fn = (target: string) => {
            https.get(target, { timeout, headers, agent, }, (res: any) => {
                times++
                const { statusCode, headers } = res;
                let error: Error;
                if (statusCode !== 200) {
                    if (times <= 3 && [301, 302, 303].includes(statusCode)) {
                        if (headers.location.substr(0, 4).toLowerCase() == "http") {
                            target = headers.location
                        } else {
                            const u = new URL(target)
                            if (headers.location.charAt(0) == "/") {
                                target = u.origin + headers.location
                            } else {
                                const arr = u.pathname.split('/')
                                arr[arr.length - 1] = headers.location
                                target = u.origin + arr.join('/')
                            }
                        }
                        return fn(target)
                    }
                    error = new Error(`${url} Status Code: ${statusCode}`);
                }
                if (error) {
                    res.resume();
                    return reject(error)
                }
                const buf = [];
                res.on('error', reject).on('data', (chunk: Buffer) => { buf.push(chunk); }).on('end', () => resolve(Buffer.concat(buf)));
            }).on('error', reject);
        }
        fn(url)
    })
}

async function httpPost(url: string, body: string): Promise<string> {
    const u = new URL(url)
    const options = {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        timeout: 5000,
        rejectUnauthorized: false,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:74.0) Gecko/20100101 Firefox/74.0',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Content-Type': 'application/json'
        }
    }
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res: any) => {
            const buf = [];
            res.on('data', (chunk: unknown) => {
                buf.push(chunk);
            });
            res.on('end', () => {
                resolve(Buffer.concat(buf).toString());
            });
        })
            .on('timeout', e => {
                reject(e ? e.toString() : 'request timeout');
            })
            .on('error', e => {
                reject(e);
            })
            .once('response', e => {
                if (![200, 204, 304].includes(e.statusCode)) {
                    reject(e.statusCode)
                }
            });
        req.write(body);
        req.end();
    })

}