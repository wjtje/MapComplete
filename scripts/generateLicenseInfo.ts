import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs"
import SmallLicense from "../Models/smallLicense"
import ScriptUtils from "./ScriptUtils"

const prompt = require("prompt-sync")()

function validateLicenseInfo(l: SmallLicense) {
    l.sources.map((s) => {
        try {
            return new URL(s)
        } catch (e) {
            throw "Could not parse URL " + s + " for a license for " + l.path + " due to " + e
        }
    })
}
/**
 * Sweeps the entire 'assets/' (except assets/generated) directory for image files and any 'license_info.json'-file.
 * Checks that the license info is included for each of them and generates a compiles license_info.json for those
 */

function generateLicenseInfos(paths: string[]): SmallLicense[] {
    const licenses = []
    for (const path of paths) {
        try {
            const parsed = JSON.parse(readFileSync(path, { encoding: "utf8" }))
            if (Array.isArray(parsed)) {
                const l: SmallLicense[] = parsed
                for (const smallLicens of l) {
                    smallLicens.path =
                        path.substring(0, path.length - "license_info.json".length) +
                        smallLicens.path
                }
                licenses.push(...l)
            } else {
                const smallLicens: SmallLicense = parsed
                smallLicens.path = path.substring(0, 1 + path.lastIndexOf("/")) + smallLicens.path
                licenses.push(smallLicens)
            }
        } catch (e) {
            console.error("Error: ", e, "while handling", path)
        }
    }
    return licenses
}

function missingLicenseInfos(licenseInfos: SmallLicense[], allIcons: string[]) {
    const missing = []

    const knownPaths = new Set<string>()
    for (const licenseInfo of licenseInfos) {
        knownPaths.add(licenseInfo.path)
    }

    for (const iconPath of allIcons) {
        if (iconPath.indexOf("license_info.json") >= 0) {
            continue
        }
        if (knownPaths.has(iconPath)) {
            continue
        }
        missing.push(iconPath)
    }
    return missing
}

const knownLicenses = new Map<string, SmallLicense>()
knownLicenses.set("me", {
    authors: ["Pieter Vander Vennet"],
    path: undefined,
    license: "CC0",
    sources: [],
})
knownLicenses.set("streetcomplete", {
    authors: ["Tobias Zwick (westnordost)"],
    path: undefined,
    license: "CC0",
    sources: [
        "https://github.com/streetcomplete/StreetComplete/tree/master/res/graphics",
        "https://f-droid.org/packages/de.westnordost.streetcomplete/",
    ],
})

knownLicenses.set("temaki", {
    authors: ["Temaki"],
    path: undefined,
    license: "CC0",
    sources: ["https://github.com/ideditor/temaki", "https://ideditor.github.io/temaki/docs/"],
})

knownLicenses.set("maki", {
    authors: ["Maki"],
    path: undefined,
    license: "CC0",
    sources: ["https://labs.mapbox.com/maki-icons/"],
})

knownLicenses.set("t", {
    authors: [],
    path: undefined,
    license: "CC0; trivial",
    sources: [],
})
knownLicenses.set("na", {
    authors: [],
    path: undefined,
    license: "CC0",
    sources: [],
})
knownLicenses.set("tv", {
    authors: ["Toerisme Vlaanderen"],
    path: undefined,
    license: "CC0",
    sources: [
        "https://toerismevlaanderen.be/pinjepunt",
        "https://mapcomplete.osm.be/toerisme_vlaanderenn",
    ],
})
knownLicenses.set("tvf", {
    authors: ["Jo De Baerdemaeker "],
    path: undefined,
    license: "All rights reserved",
    sources: ["https://www.studiotype.be/fonts/flandersart"],
})
knownLicenses.set("twemoji", {
    authors: ["Twemoji"],
    path: undefined,
    license: "CC-BY 4.0",
    sources: ["https://github.com/twitter/twemoji"],
})

function promptLicenseFor(path): SmallLicense {
    console.log("License abbreviations:")
    knownLicenses.forEach((value, key) => {
        console.log(key, " => ", value)
    })
    const author = prompt("What is the author for artwork " + path + "? (or: [Q]uit, [S]kip)  > ")
    path = path.substring(path.lastIndexOf("/") + 1)

    if (knownLicenses.has(author)) {
        const license = knownLicenses.get(author)
        license.path = path
        return license
    }

    if (author == "s") {
        return null
    }
    if (author == "Q" || author == "q" || author == "") {
        throw "Quitting now!"
    }
    let authors = author.split(";")
    if (author.toLowerCase() == "none") {
        authors = []
    }
    return {
        authors: author.split(";"),
        path: path,
        license: prompt("What is the license for artwork " + path + "?  > "),
        sources: prompt("Where was this artwork found?  > ").split(";"),
    }
}

function createLicenseInfoFor(path): void {
    const li = promptLicenseFor(path)
    if (li == null) {
        return
    }
    writeFileSync(path + ".license_info.json", JSON.stringify(li, null, "  "))
}

function cleanLicenseInfo(allPaths: string[], allLicenseInfos: SmallLicense[]) {
    // Read the license info file from the generated assets, creates a compiled license info in every directory
    // Note: this removes all the old license infos
    for (const licensePath of allPaths) {
        unlinkSync(licensePath)
    }

    const perDirectory = new Map<string, SmallLicense[]>()

    for (const license of allLicenseInfos) {
        const p = license.path
        const dir = p.substring(0, p.lastIndexOf("/"))
        license.path = p.substring(dir.length + 1)
        if (!perDirectory.has(dir)) {
            perDirectory.set(dir, [])
        }
        const cloned: SmallLicense = {
            // We make a clone to force the order of the keys
            path: license.path,
            license: license.license,
            authors: license.authors,
            sources: license.sources,
        }
        perDirectory.get(dir).push(cloned)
    }

    perDirectory.forEach((licenses, dir) => {
        for (let i = licenses.length - 1; i >= 0; i--) {
            const license = licenses[i]
            const path = dir + "/" + license.path
            if (!existsSync(path)) {
                console.log(
                    "Found license for now missing file: ",
                    path,
                    " - removing this license"
                )
                licenses.splice(i, 1)
            }
        }

        licenses.sort((a, b) => (a.path < b.path ? -1 : 1))
        writeFileSync(dir + "/license_info.json", JSON.stringify(licenses, null, 2))
    })
}

function queryMissingLicenses(missingLicenses: string[]) {
    process.on("SIGINT", function () {
        console.log("Aborting... Bye!")
        process.exit()
    })

    let i = 1
    for (const missingLicens of missingLicenses) {
        console.log(i + " / " + missingLicenses.length)
        i++
        if (i < missingLicenses.length - 5) {
            //    continue
        }
        createLicenseInfoFor(missingLicens)
    }

    console.log("You're through!")
}

/**
 * Creates the humongous license_info in the generated assets, containing all licenses with a path relative to the root
 * @param licensePaths
 */
function createFullLicenseOverview(licensePaths: string[]) {
    const allLicenses: SmallLicense[] = []
    for (const licensePath of licensePaths) {
        if (!existsSync(licensePath)) {
            continue
        }
        const licenses = <SmallLicense[]>JSON.parse(readFileSync(licensePath, { encoding: "utf8" }))
        for (const license of licenses) {
            validateLicenseInfo(license)
            const dir = licensePath.substring(0, licensePath.length - "license_info.json".length)
            license.path = dir + license.path
            allLicenses.push(license)
        }
    }

    writeFileSync("./assets/generated/license_info.json", JSON.stringify(allLicenses, null, "  "))
}

function main(args: string[]) {
    console.log("Checking and compiling license info")

    if (!existsSync("./assets/generated")) {
        mkdirSync("./assets/generated")
    }

    let contents = ScriptUtils.readDirRecSync("./assets")
        .filter((p) => !p.startsWith("./assets/templates/"))
        .filter((entry) => entry.indexOf("./assets/generated") != 0)
    let licensePaths = contents.filter((entry) => entry.indexOf("license_info.json") >= 0)
    let licenseInfos = generateLicenseInfos(licensePaths)

    const artwork = contents.filter(
        (pth) => pth.match(/(.svg|.png|.jpg|.ttf|.otf|.woff)$/i) != null
    )
    const missingLicenses = missingLicenseInfos(licenseInfos, artwork)
    if (args.indexOf("--prompt") >= 0 || args.indexOf("--query") >= 0) {
        queryMissingLicenses(missingLicenses)
        return main([])
    }

    const invalidLicenses = licenseInfos
        .filter((l) => (l.license ?? "") === "")
        .map((l) => `License for artwork ${l.path} is empty string or undefined`)

    let invalid = 0
    for (const licenseInfo of licenseInfos) {
        const isTrivial =
            licenseInfo.license
                .split(";")
                .map((l) => l.trim().toLowerCase())
                .indexOf("trivial") >= 0
        if (licenseInfo.sources.length + licenseInfo.authors.length == 0 && !isTrivial) {
            invalid++
            invalidLicenses.push(
                "Invalid license: No sources nor authors given in the license for " +
                    JSON.stringify(licenseInfo)
            )
            continue
        }

        for (const source of licenseInfo.sources) {
            if (source == "") {
                invalidLicenses.push(
                    "Invalid license: empty string in " + JSON.stringify(licenseInfo)
                )
            }
            try {
                new URL(source)
            } catch {
                invalidLicenses.push("Not a valid URL: " + source)
            }
        }
    }

    if (missingLicenses.length > 0 || invalidLicenses.length) {
        const msg = `There are ${missingLicenses.length} licenses missing and ${invalidLicenses.length} invalid licenses.`
        console.log(missingLicenses.concat(invalidLicenses).join("\n"))
        console.error(msg)
        if (args.indexOf("--no-fail") < 0) {
            throw msg
        }
    }

    cleanLicenseInfo(licensePaths, licenseInfos)
    createFullLicenseOverview(licensePaths)
}

main(process.argv.slice(2))
