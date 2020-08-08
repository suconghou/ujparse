import { parseQuery } from './util'
import decipher from './decipher'
const baseURL = 'https://www.youtube.com'
const store = new Map()

class infoGetter {
    protected fetch: Function
    protected jsPath: string;
    protected videoDetails: any;
    protected streamingData: any;
    async parse(itagURL?: string): Promise<any> {
        const info = {
            'id': this.videoDetails.videoId,
            'title': this.videoDetails.title,
            'duration': this.videoDetails.lengthSeconds,
            'author': this.videoDetails.author,
        }
        const streams = {}
        for (let item of this.streamingData.formats) {
            const itag = item.itag
            const s = {
                "quality": item.qualityLabel || item.quality,
                "type": item.mimeType.replace(/\+/g, ' '),
                "itag": itag,
                "len": item.contentLength,
            }
            if (itagURL == itag) {
                s['url'] = await this.buildURL(item)
            }
            streams[itag] = s
        }
        for (let item of this.streamingData.adaptiveFormats) {
            const itag = item.itag
            const s = {
                "quality": item.qualityLabel || item.quality,
                "type": item.mimeType.replace(/\+/g, ' '),
                "itag": itag,
                "len": item.contentLength,
                "initRange": item.initRange,
                "indexRange": item.indexRange
            }
            if (itagURL == itag) {
                s['url'] = await this.buildURL(item)
            }
            streams[itag] = s
        }
        info['streams'] = streams;
        return info;
    }
    private async buildURL(item: any): Promise<string> {
        if (item.url) {
            return item.url
        }
        const cipher = item.cipher ? item.cipher : item.signatureCipher;
        if (!cipher) {
            throw new Error("not found url or cipher");
        }
        const u = parseQuery(cipher)
        if (!u.url) {
            throw new Error("can not parse url")
        }
        return u.url + await this.signature(u)
    }

    private async signature(u: any): Promise<string> {
        const sp = u.sp || "signature"
        if (u.s) {
            if (!this.jsPath) {
                throw new Error("jsPath not avaiable")
            }
            const d = new decipher(baseURL + this.jsPath, this.fetch)
            const sig = await d.decode(u.s)
            return `&${sp}=${sig}`
        }
        else if (u.sig) {
            return `&${sp}=${u.sig}`
        } else {
            throw new Error("can not decipher url")
        }
    }
}

class pageParser extends infoGetter {
    private videoPageURL: string

    constructor(private vid: string, protected fetch: Function) {
        super()
        this.videoPageURL = `${baseURL}/watch?v=${vid}&spf=prefetch`
    }
    async init() {
        const pageData = JSON.parse(await this.fetch(this.videoPageURL))
        if (!Array.isArray(pageData)) {
            throw new Error("video page data error")
        }
        let jsPath: string,
            player_response: any;
        for (let item of pageData) {
            if (item && item.title && item.data) {
                const data = item.data
                player_response = JSON.parse(data.swfcfg.args.player_response)
                jsPath = data.swfcfg.assets.js
            }
        }
        if (!player_response || !jsPath) {
            throw new Error("not found player_response");
        }
        if (!player_response.streamingData || !player_response.videoDetails) {
            throw new Error("invalid player_response");
        }
        this.jsPath = jsPath
        this.videoDetails = player_response.videoDetails;
        this.streamingData = player_response.streamingData
        store.set("jsPath", jsPath)
    }
}

class infoParser extends infoGetter {
    private videoInfoURL: string

    constructor(private vid: string, protected fetch: Function) {
        super()
        this.videoInfoURL = `${baseURL}/get_video_info?video_id=${vid}`
    }
    async init() {
        const data = parseQuery(await this.fetch(this.videoInfoURL))
        if (data.status !== 'ok') {
            throw new Error(`${data.status}:code ${data.errorcode},reason ${data.reason}`);
        }
        const player_response = JSON.parse(data.player_response)
        if (!player_response) {
            throw new Error("empty player_response")
        }
        this.videoDetails = player_response.videoDetails;
        this.streamingData = player_response.streamingData;
        this.jsPath = store.get("jsPath")
    }
}


export default class {
    private parser: pageParser | infoParser
    constructor(private vid: string, private fetch: Function) {
    }

    private async initParser() {
        try {
            const parser = new pageParser(this.vid, this.fetch)
            await parser.init()
            this.parser = parser;
        } catch (e) {
            console.error(e, ' , try infoParser')
            const parser = new infoParser(this.vid, this.fetch)
            await parser.init()
            this.parser = parser;
        }
    }

    async info() {
        if (!this.parser) {
            await this.initParser()
        }
        return await this.parser.parse()
    }

    async infoPart(itag: string) {
        if (!this.parser) {
            await this.initParser()
        }
        const info = await this.parser.parse(itag)
        const itagInfo = info.streams[itag]
        if (!itagInfo) {
            throw new Error(`itag ${itag} not found`)
        }
        return {
            'url': itagInfo['url']
        }
    }

}
