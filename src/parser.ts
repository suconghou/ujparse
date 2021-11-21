import { parseQuery } from './util'
import decipher from './decipher'
const baseURL = 'https://www.youtube.com'
const store = new Map()


class infoParser {
    private videoPageURL: string
    private playerURL = "https://youtubei.googleapis.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    private decipher: decipher;
    private jsPath: string;
    private videoDetails: any;
    private streamingData: any;
    private error: string;

    constructor(private vid: string, private fetch: Function, private doPost: Function) {
        this.videoPageURL = `${baseURL}/watch?v=${vid}`
    }

    async init() {
        try {
            await this.playerParse()
        } catch (e) {
            await this.pageParse()
        }
    }

    private async playerParse() {
        const obj = {
            "videoId": this.vid,
            "context": {
                "client": {
                    "clientName": "Android",
                    "clientVersion": "16.13.35"
                }
            }
        }
        const body = JSON.stringify(obj)
        const res = await this.doPost(this.playerURL, body, this.vid)
        const [videoDetails, streamingData] = this.extract(res);
        this.videoDetails = videoDetails;
        this.streamingData = streamingData
    }

    private async pageParse() {
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
        const arr = text.match(/ytInitialPlayerResponse\s+=\s+(.*}{3,});\s*var/)
        if (!arr || arr.length < 2) {
            throw new Error("ytInitialPlayerResponse not found")
        }
        const [videoDetails, streamingData] = this.extract(arr[1]);
        this.jsPath = jsPath || store.get("jsPath")
        this.videoDetails = videoDetails;
        this.streamingData = streamingData
    }

    private extract(text: string) {
        const data = JSON.parse(text);
        if (!data) {
            throw new Error("parse ytInitialPlayerResponse error")
        }
        if (!data.videoDetails || !data.playabilityStatus) {
            throw new Error("invalid ytInitialPlayerResponse")
        }
        const ps = data.playabilityStatus
        const s = ps.status
        if (s != "OK") {
            const reason = ps.reason || s;
            throw new Error(reason)
        }
        if (!data.streamingData) {
            throw new Error("no streamingData")
        }
        return [data.videoDetails, data.streamingData];
    }

    async parse(): Promise<any> {
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
        for (const item of (this.streamingData.formats || []).concat(this.streamingData.adaptiveFormats || [])) {
            const itag = String(item.itag)
            const s = {
                "quality": item.qualityLabel || item.quality,
                "type": item.mimeType.replace(/\+/g, ' '),
                "itag": itag,
                "len": item.contentLength,
                'url': await this.buildURL(item)
            }
            if (item.initRange && item.indexRange) {
                s["initRange"] = item.initRange;
                s["indexRange"] = item.indexRange;
            }
            streams[itag] = s;
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
            if (!this.decipher) {
                if (!this.jsPath) {
                    throw new Error("jsPath not avaiable")
                }
                const bodystr = await this.fetch(baseURL + this.jsPath)
                this.decipher = new decipher(bodystr)
            }
            const sig = this.decipher.decode(u.s)
            return `&${sp}=${sig}`
        }
        else if (u.sig) {
            return `&${sp}=${u.sig}`
        } else {
            throw new Error("can not decipher url")
        }
    }

}

export default class {
    private parser: infoParser
    constructor(private vid: string, private fetch: Function, private doPost: Function) {
        if (!vid || typeof fetch != 'function' || typeof doPost != 'function') {
            throw new Error("invalid params");
        }
    }

    private async initParser() {
        const parser = new infoParser(this.vid, this.fetch, this.doPost)
        await parser.init()
        this.parser = parser;
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
        const info = await this.parser.parse()
        const itagInfo = info.streams[itag]
        if (!itagInfo) {
            throw new Error(`itag ${itag} not found`)
        }
        return {
            'url': itagInfo['url']
        }
    }

}
