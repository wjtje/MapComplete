/**
 * Fetches all 'modern languages' from wikidata, then exports their names in every language.
 * Some meta-info (e.g. RTL) is exported too
 */

import * as wds from "wikidata-sdk"
import { Utils } from "../Utils"
import ScriptUtils from "./ScriptUtils"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { QuestionableTagRenderingConfigJson } from "../Models/ThemeConfig/Json/QuestionableTagRenderingConfigJson"
import { LayerConfigJson } from "../Models/ThemeConfig/Json/LayerConfigJson"
import WikidataUtils from "../Utils/WikidataUtils"
import LanguageUtils from "../Utils/LanguageUtils"

async function fetch(target: string) {
    const regular = await fetchRegularLanguages()
    writeFileSync(target, JSON.stringify(regular, null, "  "))
    console.log("Written to " + target)
}

async function fetchRegularLanguages() {
    console.log("Fetching languages")

    const sparql =
        "SELECT ?lang ?label ?code ?directionalityLabel \n" +
        "WHERE \n" +
        "{ \n" +
        "  ?lang wdt:P31 wd:Q1288568. \n" + // language instanceOf (p31) modern language(Q1288568)
        "  ?lang rdfs:label ?label. \n" +
        " ?lang wdt:P282 ?writing_system. \n" +
        "  ?writing_system wdt:P1406 ?directionality. \n" +
        "  ?lang wdt:P424 ?code. \n" + // Wikimedia language code seems to be close to the weblate entries
        '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } \n' +
        "} "
    const url = wds.sparqlQuery(sparql)

    // request the generated URL with your favorite HTTP request library
    const result = await Utils.downloadJson(url, { "User-Agent": "MapComplete script" })
    const bindings = result.results.bindings

    const zh_hant = await fetchSpecial(18130932, "zh_Hant")
    const zh_hans = await fetchSpecial(13414913, "zh_Hant")
    const pt_br = await fetchSpecial(750553, "pt_BR")
    const fil = await fetchSpecial(33298, "fil")

    bindings.push(...zh_hant)
    bindings.push(...zh_hans)
    bindings.push(...pt_br)
    bindings.push(...fil)

    return result.results.bindings
}

async function fetchSpecial(id: number, code: string) {
    ScriptUtils.fixUtils()
    console.log("Fetching languages")

    const sparql =
        "SELECT ?lang ?label ?code \n" +
        "WHERE \n" +
        "{ \n" +
        "  wd:Q" +
        id +
        " rdfs:label ?label. \n" +
        "} "
    const url = wds.sparqlQuery(sparql)

    const result = await Utils.downloadJson(url, { "User-Agent": "MapComplete script" })
    const bindings = result.results.bindings
    bindings.forEach((binding) => (binding["code"] = { value: code }))
    return bindings
}

function getNativeList(langs: Map<string, { translations: Map<string, string> }>) {
    const native = {}
    const keys: string[] = Array.from(langs.keys())
    keys.sort()
    for (const key of keys) {
        const translations: Map<string, string> = langs.get(key).translations
        if (!LanguageUtils.usedLanguages.has(key)) {
            continue
        }
        native[key] = translations.get(key)
        if (native[key] === undefined) {
            console.log("No native translation found for " + key)
        }
    }
    return native
}

async function getOfficialLanguagesPerCountry(): Promise<Map<string, string[]>> {
    const lngs = new Map<string, string[]>()
    const sparql = `SELECT ?country ?countryLabel ?countryCode ?language ?languageCode ?languageLabel
    WHERE
    {
            ?country wdt:P31/wdt:P279* wd:Q3624078;
        wdt:P297 ?countryCode;
        wdt:P37 ?language.
            ?language wdt:P218 ?languageCode.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`
    const url = wds.sparqlQuery(sparql)

    const result = await Utils.downloadJson(url, { "User-Agent": "MapComplete script" })
    const bindings: { countryCode: { value: string }; languageCode: { value: string } }[] =
        result.results.bindings
    for (const binding of bindings) {
        const countryCode = binding.countryCode.value
        const language = binding.languageCode.value
        if (lngs.get(countryCode) === undefined) {
            lngs.set(countryCode, [])
        }
        lngs.get(countryCode).push(language)
    }
    return lngs
}

async function getOfficialLanguagesPerCountryCached(
    wipeCache: boolean
): Promise<Record<string /*Country code*/, string[] /*Language codes*/>> {
    let officialLanguages: Record<string, string[]>
    const officialLanguagesPath = "./assets/language_in_country.json"
    if (existsSync("./assets/languages_in_country.json") && !wipeCache) {
        officialLanguages = JSON.parse(readFileSync(officialLanguagesPath, "utf8"))
    } else {
        officialLanguages = Utils.MapToObj(await getOfficialLanguagesPerCountry(), (t) => t)
        writeFileSync(officialLanguagesPath, JSON.stringify(officialLanguages, null, "  "))
    }
    return officialLanguages
}

async function main(wipeCache = false) {
    const cacheFile = "./assets/generated/languages-wd.json"
    if (wipeCache || !existsSync(cacheFile)) {
        console.log("Refreshing cache")
        await fetch(cacheFile)
    } else {
        console.log("Reusing the cached file")
    }

    const data = JSON.parse(readFileSync(cacheFile, { encoding: "utf8" }))
    const perId = WikidataUtils.extractLanguageData(data, WikidataUtils.languageRemapping)
    const nativeList = getNativeList(perId)
    writeFileSync("./assets/language_native.json", JSON.stringify(nativeList, null, "  "))
    const languagesPerCountry = Utils.TransposeMap(
        await getOfficialLanguagesPerCountryCached(wipeCache)
    )
    const translations = Utils.MapToObj(perId, (value, key) => {
        // We keep all language codes in the list...
        const translatedForId: Record<string, string | { countries?: string[]; dir: string[] }> =
            Utils.MapToObj(value.translations, (v, k) => {
                if (!LanguageUtils.usedLanguages.has(k)) {
                    // ... but don't keep translations if we don't have a displayed language for them
                    return undefined
                }
                return v
            })

        translatedForId["_meta"] = {
            countries: Utils.Dedup(languagesPerCountry[key]),
            dir: value.directionality,
        }

        return translatedForId
    })

    writeFileSync("./assets/language_translations.json", JSON.stringify(translations, null, "  "))
}

const forceRefresh = process.argv[2] === "--force-refresh"
ScriptUtils.fixUtils()
main(forceRefresh).then(() => console.log("Done!"))
