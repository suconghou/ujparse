import { parseQuery } from './util'
import decipher from './decipher'
const baseURL = 'https://www.youtube.com'
const store = new Map()

class infoGetter {
    protected fetch: Function
    protected jsPath: string;
    protected videoDetails: any;
    protected streamingData: any;
    protected error: string;
    async parse(itagURL?: string): Promise<any> {
        const info = {
            'id': this.videoDetails.videoId,
            'title': this.videoDetails.title,
            'duration': this.videoDetails.lengthSeconds,
            'author': this.videoDetails.author,
        }
        const streams = {}
        info['streams'] = streams;
        if (this.error) {
            info['error'] = this.error
            return info
        }
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
        this.videoPageURL = `${baseURL}/watch?v=${vid}`
    }
    async init() {
        const text = await this.fetch(this.videoPageURL)
        if (!text) {
            throw new Error("get page data failed");
        }
        const arr = text.match(/ytplayer\.config\s*=\s*({.+?});ytplayer/)
        if (!arr || arr.length < 2) {
            throw new Error("ytplayer config not found")
        }
        const data = JSON.parse(arr[1])
        let jsPath: string,
            player_response: any;
        const args = data.args;
        const assets = data.assets;
        if (!args || !assets) {
            throw new Error("not found player_response");
        }
        jsPath = assets.js;
        player_response = JSON.parse(args.player_response)
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
            throw new Error(`${data.status}:code ${data.errorcode},reason ${data.reason.replace(/\+/g, ' ')}`);
        }
        const player_response = JSON.parse(data.player_response)
        if (!player_response) {
            throw new Error("empty player_response")
        }
        const ps = player_response.playabilityStatus
        if (['UNPLAYABLE', 'LOGIN_REQUIRED', 'ERROR'].includes(ps.status)) {
            // 私享视频 视频信息都获取不到,必须终止
            const { reason, errorScreen } = ps
            let subreason = reason || ps.status
            if (errorScreen && errorScreen.playerErrorMessageRenderer && errorScreen.playerErrorMessageRenderer.subreason) {
                subreason += ' ' + errorScreen.playerErrorMessageRenderer.subreason.simpleText
            }
            subreason = subreason.replace(/\+/g, ' ')
            if (['LOGIN_REQUIRED', 'ERROR'].includes(ps.status)) {
                throw new Error(subreason)
            }
            this.error = subreason
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
