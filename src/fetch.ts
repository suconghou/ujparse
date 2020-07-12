
// 当前的http执行器是cf worker的fetch
// 可以改写成基于xhr或node http request都可以
export const ajax = async (url: string): Promise<string> => {
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
    return await r.text()
}
