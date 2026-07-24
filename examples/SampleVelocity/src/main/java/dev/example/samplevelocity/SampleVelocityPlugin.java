package dev.example.samplevelocity;

import com.google.inject.Inject;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.PostLoginEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.ProxyServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.slf4j.Logger;

@Plugin(
    id = "samplevelocity",
    name = "SampleVelocity",
    version = "1.0.0",
    description = "Demo Velocity proxy plugin for mc-sdk",
    authors = {"example"}
)
public final class SampleVelocityPlugin {
    private final ProxyServer server;
    private final Logger logger;

    @Inject
    public SampleVelocityPlugin(ProxyServer server, Logger logger) {
        this.server = server;
        this.logger = logger;
    }

    @Subscribe
    public void onProxyInit(ProxyInitializeEvent event) {
        server.getCommandManager().register(
            server.getCommandManager().metaBuilder("sampleping").plugin(this).build(),
            new PingCommand()
        );
        logger.info("SampleVelocity enabled — try /sampleping");
    }

    @Subscribe
    public void onPostLogin(PostLoginEvent event) {
        event.getPlayer().sendMessage(
            Component.text("Welcome to the proxy — /sampleping", NamedTextColor.GREEN)
        );
    }

    private static final class PingCommand implements SimpleCommand {
        @Override
        public void execute(Invocation invocation) {
            invocation.source().sendMessage(
                Component.text("Pong from SampleVelocity", NamedTextColor.AQUA)
            );
        }
    }
}
