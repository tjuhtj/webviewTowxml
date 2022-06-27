const cheerio = require('cheerio');
const fs = require('fs');

let allFiles = fs.readdirSync('bugtest')

let helpCount = 0;

let count = 0;

let setDisplayAlready = []

let files = allFiles.filter((item) => {
    if (item.endsWith('.htm') || item.endsWith('.html') || item.endsWith('.xml')) return true
})

function currectSelect(item, select) {
    if ((item.class != null && item.class.includes(select.replace('.', ''))) || (item.id !== undefined && item.id.includes(select.replace('#', ''))) || select == 'view') {
        return true
    }
    return false
}

function findNode(path, i, body, list, parent) {
    if (i == path.length) list.push(body)
    for (let item of body.childItems) {
        if (item.tag != 'div') continue;
        let selectStatus = 0;
        let nth = 0;

        let tag = path[i];
        if (path[i][0] == '.' || path[i][0] == '#') {
            tag = path[i].slice(1)
        }

        if (currectSelect(item, tag)) {
            selectStatus = 'allIn';

            if (Number.isInteger(path[i + 1])) {
                let nth = path[i + 1];
                let tagNth = 0;
                while (nth > 0) {
                    if (body.childItems[tagNth].tag != 'text') nth--;
                    tagNth++;
                }
                if (item == body.childItems[tagNth - 1]) {
                    findNode(path, i + 2, item, list)
                }
                else {
                    findNode(path, 0, item, list)
                }
            }
        }
        if (selectStatus == 0) {
            findNode(path, 0, item, list)
        }
        else {
            findNode(path, i + 1, item, list)
        }
    }
}

function nodePath(body) {
    let list = []
    console.log(setDisplayAlready)
    setDisplayAlready.forEach((item) => {
        findNode(item, 0, body, list, null)
    })

    return list
}

function initalizeWebView(body, parent) {
    if (body.children == undefined || body.children.length == 0) return

    console.log('-----------------------------------------------------')
    body.children.forEach((child) => {
        if (!(child.type == 'text' && child.parent.name == 'body')) {
            let childItem = {
                tag: ''
            }

            if (child.type == 'tag') {
                childItem.childItems = []
                childItem.tag = child.name
                childItem.id = child.attribs['id']
                if (child.name == 'div' || child.name == 'body') {
                    childItem.class = child.attribs['class'] !== undefined ? child.attribs['class'] + " helpclass" + count++ : "helpclass" + count++;
                    helpCount++;
                }
                else {
                    childItem.class = child.attribs['class'] !== undefined ? child.attribs['class'] : null;
                }
            }
            else {
                childItem.tag = child.type
                childItem.text = child.data.replace(/^\s+|\s+$/g, '')
            }
            //childItem.children = child.children()
            parent.childItems.push(childItem)
            if (child.children !== undefined && child.children.length !== 0)
                initalizeWebView(child, parent.childItems[parent.childItems.length - 1])
        }
    })
}

function tranToWXML(webDom) {
    let wxml = {
        tag: ''
    }
    if (webDom.tag == 'body' || webDom.tag == 'div') {
        wxml.tag = 'view';
        wxml.id = webDom.id;
        wxml.class = webDom.class;
        wxml.childItems = []
    }
    else if (webDom.tag == 'span' || webDom.tag == 'h1' || webDom.tag == 'p' || webDom.tag == 'strong') {
        wxml.tag = 'text';
        wxml.id = webDom.id;
        wxml.class = webDom.class;
        wxml.childItems = []
    }
    else if (webDom.tag == 'text') {
        wxml.tag = 'wxmlText'
        wxml.text = webDom.text
    }

    if (webDom.tag !== 'text' && webDom.childItems.length !== 0) {
        for (let item of webDom.childItems) {
            wxml.childItems.push(tranToWXML(item))
        }
    }
    return wxml
}

function writeWXML(wxml) {
    let strWxml = '';
    if (wxml.tag == 'wxmlText') {
        return wxml.text
    }
    for (let child of wxml.childItems) {
        strWxml += writeWXML(child)
    }
    let finallyStr = ''
    finallyStr = '<' + wxml.tag
    if (wxml.id !== undefined) finallyStr += (' id=' + "\"" + wxml.id + "\"")
    if (wxml.class !== null)
        finallyStr += (' class=' + "\"" + wxml.class + "\"")
    finallyStr += ('>' + strWxml + '</' + wxml.tag + '>')
    return finallyStr;
}

function writeWXSS(wxss) {
    let strWxss = '';
    for (let item of wxss) {
        strWxss += (item + '\n')
    }
    return strWxss
}

function initalizeCss(webStyle, webDom) {

    let itemCssList = webStyle.split('}')
    itemCssList = itemCssList.map(item => {

        item = item.split('{');
        if (item.length > 1)
            item[1] = item[1].replace(/\ +/g, "").replace(/[\r\n]/g, "");
        item[0] = item[0].replace(/(^\s*)|(\s*$)/g, "")

        let divIndex = item[0].indexOf('div');
        while (divIndex !== -1) {
            if (divIndex == 0 || (item[0][divIndex - 1] == ' ')) {
                item[0] = item[0].replace('div', 'view')
            }
            divIndex = item[0].indexOf('div', divIndex + 1)
        }

        let textlist = ['span', 'h1', 'p', 'strong'];
        let textIndex = -1;
        for (let textItem of textlist) {
            textIndex = item[0].indexOf(textItem);
            while (textIndex !== -1) {
                if (textIndex == 0 || item[0][textIndex - 1] == ' ') {
                    item[0] = item[0].replace(textItem, 'text')
                }
                textIndex = item[0].indexOf(textItem, textIndex + 1)
            }
        }

        if (item[0].includes('nth-child')) {
            let itemList = item[0].split(':nth-child')
            let nth = itemList[1].replace('(', '').replace(')', '');
            nth = Number(nth)
            let nthSelector = itemList[0].split(' ');
            nthSelector = nthSelector[nthSelector.length - 1]
        }

        item = item.join('{') + '}';
        return item
    });

    for (let i = 0; i < itemCssList.length; i++) {
        let item = itemCssList[i];
        if (item.includes("display:flex") || item.includes("display: flex")) {

            if (item.includes("flex-direction:column") || item.includes("flex-direction: column")) continue;
            else {
                let tmp = item.split('}');
                tmp[0] = tmp[0] + "flex-direction:column;}";
                itemCssList[i] = tmp[0]
                let selectorTmp = tmp[0].split('{')[0];
                let selectorPath = [];
                let afterSelector = '';
                selectorTmp.split(' ').forEach((item) => {
                    if (item == 'view') {
                        selectorPath.push(item);
                    }
                    else {
                        if (item.includes('nth-child')) {
                            afterSelector = Number(item.split('nth-child')[1].replace('(', '').replace(')', ''))
                            item = item.split(':nth-child')[0]
                        }
                        let left = 0;
                        let right = 0;
                        while (right < item.length) {
                            if (item[right] !== '.' && item[right] !== '#') right++;
                            else {
                                if (right > left)
                                    selectorPath.push(item.slice(left, right))
                                left = right;
                                right++;
                            }
                        }
                        selectorPath.push(item.slice(left, right))
                        if (afterSelector !== '')
                            selectorPath.push(afterSelector)
                    }
                })

                setDisplayAlready.push(selectorPath)
            }

        }
    }
    itemCssList.length--;

    let alreadyList = nodePath(webDom)
    console.log('------------')
    console.log(alreadyList)
    let listNumber = []
    alreadyList.forEach((item) => {
        listNumber.push(Number(item.class.split('helpclass')[1].split(' ')[0]))
    })

    for (let i = 1; i < helpCount + 1; i++) {
        if (listNumber.indexOf(i) != -1) continue
        let str = '.helpclass' + i + '{display:flex;flex-direction:column;}'
        itemCssList.push(str)
    }
    return (itemCssList)
}

for (let item of files) {
    //html文件
    let url = 'bugtest/' + item;
    let file = fs.readFileSync(url.toString(), 'utf8');
    let myHtml = cheerio.load(file);
    let body = myHtml('body');
    let style = myHtml('style');

    let webDom = {
        tag: '',
        class: '',
        childItems: []
    };

    webDom.tag = "body";
    webDom.class = "helpclass1 body";
    //wxml.children = body.children()

    count = 2;
    helpCount = 1;
    setDisplayAlready = []

    body = body['0']

    initalizeWebView(body, webDom);
    console.log('分割')

    let wxml = tranToWXML(webDom);

    const wxmlfs = writeWXML(wxml);

    //写入wxml
    if (!fs.existsSync('result'))
        fs.mkdirSync('result')

    let newFileItem = item.split('.')[0]
    const baseUrl = 'result/' + newFileItem

    if (!fs.existsSync(baseUrl))
        fs.mkdirSync(baseUrl)
    fs.writeFileSync(baseUrl + '/flex.wxml', wxmlfs)

    let wxss = initalizeCss(style.html().toString(), webDom)
    const wxssfs = writeWXSS(wxss)
    fs.writeFileSync(baseUrl + '/flex.wxss', wxssfs)

    let jsonFile = {
        "navigationStyle": "custom",
        "navigationBarTitleText": "非自定义导航栏",
        "navigationBarTextStyle": "black",
        "navigationBarBackgroundColor": "#98FB98",
        "rendererType": "mp-native"
    }
    fs.writeFileSync(baseUrl + '/flex.json', JSON.stringify(jsonFile))
    let jsFile = 'Page({\n' + '\tdata: {\n\t}\n})'

    fs.writeFileSync(baseUrl + '/flex.js', jsFile)

}

