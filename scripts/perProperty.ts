import * as fs from "fs"

function main(args) {
    if (args.length < 2) {
        console.log(
            "Given a single geojson file and an attribute-key, will generate a new file for every value of the partition."
        )
        console.log("USAGE: perProperty `file.geojson` `property-key`")
        return
    }
    const path = args[0]
    const key = args[1]

    const data = JSON.parse(fs.readFileSync(path, { encoding: "utf8" }))
    const perProperty = new Map<string, any[]>()

    console.log("Partitioning", data.features.length, "features")
    for (const feature of data.features) {
        const v = feature.properties[key]
        if (!perProperty.has(v)) {
            console.log("Found a new category:", v)
            perProperty.set(v, [])
        }
        perProperty.get(v).push(feature)
    }

    const stripped = path.substr(0, path.length - ".geojson".length)
    perProperty.forEach((features, v) => {
        fs.writeFileSync(
            stripped + "." + v.replace(/[^a-zA-Z0-9_]/g, "_") + ".geojson",
            JSON.stringify({
                type: "FeatureCollection",
                features,
            })
        )
    })
}

main(process.argv.slice(2))
