plugins {
    java
    id("io.papermc.paperweight.userdev") version "1.7.1"
}

group = "dev.example"
version = "1.0.0"

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(21))
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    // Mojang-mapped Paper server for NMS (compile) + remapping toolchain
    paperweight.paperDevBundle("1.21.1-R0.1-SNAPSHOT")
}

tasks {
    compileJava {
        options.encoding = "UTF-8"
        options.release.set(21)
    }

    processResources {
        val props = mapOf("version" to version)
        inputs.properties(props)
        filteringCharset = "UTF-8"
        filesMatching("plugin.yml") {
            expand(props)
        }
    }

    // Paper 1.20.5+ remaps Mojang-mapped plugins at runtime;
    // reobfJar still produces a Spigot-compatible artifact when needed.
    assemble {
        dependsOn(reobfJar)
    }
}
