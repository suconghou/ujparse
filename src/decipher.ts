export default class {
    private tokens: any
    constructor(private bodystr: string) {
        this.init()
    }

    private init() {
        const bodystr = this.bodystr;
        const objResult = bodystr.match(/var ([a-zA-Z_\$][a-zA-Z_0-9]*)=\{((?:(?:[a-zA-Z_\$][a-zA-Z_0-9]*:function\(a\)\{(?:return )?a\.reverse\(\)\}|[a-zA-Z_\$][a-zA-Z_0-9]*:function\(a,b\)\{return a\.slice\(b\)\}|[a-zA-Z_\$][a-zA-Z_0-9]*:function\(a,b\)\{a\.splice\(0,b\)\}|[a-zA-Z_\$][a-zA-Z_0-9]*:function\(a,b\)\{var c=a\[0\];a\[0\]=a\[b(?:%a\.length)?\];a\[b(?:%a\.length)?\]=c(?:;return a)?\}),?\n?)+)\};/)
        if (!objResult) {
            throw new Error("objResult not match")
        }
        const funcResult = bodystr.match(/function(?: [a-zA-Z_\$][a-zA-Z_0-9]*)?\(a\)\{a=a\.split\(""\);\s*((?:(?:a=)?[a-zA-Z_\$][a-zA-Z_0-9]*\.[a-zA-Z_\$][a-zA-Z_0-9]*\(a,\d+\);)+)return a\.join\(""\)\}/)
        if (!funcResult) {
            throw new Error("funcResult not match")
        }
        const obj = objResult[1].replace(/\$/g, '\\$')
        const objBody = objResult[2].replace(/\$/g, '\\$')
        const funcBody = funcResult[1].replace(/\$/g, '\\$')
        let result = objBody.match(/(?:^|,)([a-zA-Z_\$][a-zA-Z_0-9]*):function\(a\)\{(?:return )?a\.reverse\(\)\}/m)
        const reverseKey = result ? result[1].replace(/\$/g, '\\$') : ''
        result = objBody.match(/(?:^|,)([a-zA-Z_\$][a-zA-Z_0-9]*):function\(a,b\)\{return a\.slice\(b\)\}/m)
        const sliceKey = result ? result[1].replace(/\$/g, '\\$') : ''
        result = objBody.match(/(?:^|,)([a-zA-Z_\$][a-zA-Z_0-9]*):function\(a,b\)\{a\.splice\(0,b\)\}/m)
        const spliceKey = result ? result[1].replace(/\$/g, '\\$') : ''
        result = objBody.match(/(?:^|,)([a-zA-Z_\$][a-zA-Z_0-9]*):function\(a,b\)\{var c=a\[0\];a\[0\]=a\[b(?:%a\.length)?\];a\[b(?:%a\.length)?\]=c(?:;return a)?\}/m)
        const swapKey = result ? result[1].replace(/\$/g, '\\$') : ''
        const regex = new RegExp(`(?:a=)?${obj}\\.(${[reverseKey, sliceKey, spliceKey, swapKey].filter(v => v).join('|')})\\(a,(\\d+)\\)`, 'g');
        const tokens = [];
        while ((result = regex.exec(funcBody)) !== null) {
            switch (result[1]) {
                case swapKey:
                    tokens.push(`w${result[2]}`)
                    break
                case reverseKey:
                    tokens.push("r")
                    break
                case sliceKey:
                    tokens.push(`s${result[2]}`)
                    break;
                case spliceKey:
                    tokens.push(`p${result[2]}`)
                    break
            }
        }
        if (tokens.length < 1) {
            throw new Error("error parsing signature tokens")
        }
        this.tokens = tokens
    }

    decode(s: string): string {
        let sig = s.split('')
        let pos = 0
        for (let tok of this.tokens) {
            if (tok.length > 1) {
                pos = ~~tok.slice(1);
            }
            switch (tok[0]) {
                case 'r':
                    sig = sig.reverse();
                    break
                case 'w':
                    const tmp = sig[0]
                    sig[0] = sig[pos]
                    sig[pos] = tmp
                    break
                case 's':
                    sig = sig.slice(pos);
                    break
                case 'p':
                    sig.splice(0, pos);
                    break;
            }
        }
        return sig.join('');
    }
}
