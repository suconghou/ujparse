import { ajax, doPost } from './fetch'
import parser from './parser'
export default class index extends parser {
    constructor(vid: string) {
        super(vid, ajax, doPost)
    }
}
