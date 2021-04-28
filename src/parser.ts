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
            const itag = String(item.itag)
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
            const itag = String(item.itag)
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
        let jsPath: string;
        const text = await this.fetch(this.videoPageURL)
        if (!text) {
            throw new Error("get page data failed");
        }
        const jsPathReg = text.match(/"jsUrl":"(\/s\/player.*?base.js)"/)
        if (jsPathReg && jsPathReg.length == 2) {
            jsPath = jsPathReg[1]
        }
        if (jsPath) {
            store.set("jsPath", jsPath)
        }
        let videoDetails: any;
        let streamingData: any;
        try {
            let hasJsPath: string;
            [hasJsPath, videoDetails, streamingData] = this.extract1(text);
            if (!jsPath) {
                jsPath = hasJsPath
            }
        } catch (e) {
            console.error(e, "try extract2");
            [videoDetails, streamingData] = this.extract2(text);
        }
        this.jsPath = jsPath || store.get("jsPath")
        this.videoDetails = videoDetails;
        this.streamingData = streamingData
    }

    private extract1(text: string) {
        const arr = text.match(/ytplayer\.config\s*=\s*({.+?});ytplayer/)
        if (!arr || arr.length < 2) {
            throw new Error("ytplayer config not found")
        }
        const data = JSON.parse(arr[1])
        let player_response: any;
        let jsPath: string;
        const args = data.args;
        const assets = data.assets;
        if (!args) {
            throw new Error("not found player_response");
        }
        if (assets && assets.js) {
            jsPath = assets.js;
        }
        if (jsPath) {
            store.set("jsPath", jsPath)
        }
        player_response = JSON.parse(args.player_response)
        if (!player_response.streamingData || !player_response.videoDetails) {
            throw new Error("invalid player_response");
        }
        return [jsPath, player_response.videoDetails, player_response.streamingData];
    }

    private extract2(text: string) {
        const arr = text.match(/ytInitialPlayerResponse\s+=\s+(.*\]});.*?var/)
        if (!arr || arr.length < 2) {
            throw new Error("initPlayer not found")
        }
        const data = JSON.parse(arr[1]);
        if (!data) {
            throw new Error("parse initPlayer error")
        }
        if (!data.streamingData || !data.videoDetails) {
            throw new Error("invalid initPlayer")
        }
        return [data.videoDetails, data.streamingData];
    }

}

class infoParser extends infoGetter {
    private videoInfoURL: string

    constructor(private vid: string, protected fetch: Function) {
        super()
        this.videoInfoURL = `${baseURL}/get_video_info?video_id=${vid}`
    }
    async init() {
        const infostr: string = await this.fetch(this.videoInfoURL)
        if (!infostr.includes('status') && infostr.split('&').length < 5) {
            throw new Error(infostr)
        }
        const data = parseQuery(infostr)
        if (data.status !== 'ok') {
            throw new Error(`${data.status}:code ${data.errorcode},reason ${data.reason}`);
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
                const r = errorScreen.playerErrorMessageRenderer.subreason.runs
                let s = '';
                if (r && r[0] && r[0].text) {
                    s = ' ' + r[0].text;
                }
                subreason += s
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
        if (!vid || typeof fetch != 'function') {
            throw new Error("invalid params");
        }
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
