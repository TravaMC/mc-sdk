package dev.example.samplestick;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.util.Vector;
import org.jetbrains.annotations.NotNull;

public final class StickListener implements Listener {

    private static final long COOLDOWN_MS = 2000L;
    private static final double LEAP_STRENGTH = 1.35;
    private static final double LEAP_Y = 0.45;

    private final StickFactory factory;

    public StickListener(@NotNull StickFactory factory) {
        this.factory = factory;
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = false)
    public void onInteract(PlayerInteractEvent event) {
        Action action = event.getAction();
        if (action != Action.RIGHT_CLICK_AIR && action != Action.RIGHT_CLICK_BLOCK) {
            return;
        }
        // Fire once per physical click (main hand only)
        if (event.getHand() != EquipmentSlot.HAND) {
            return;
        }

        ItemStack item = event.getItem();
        if (item == null || !factory.isSampleStick(item)) {
            return;
        }

        Player player = event.getPlayer();
        if (!player.hasPermission("samplestick.use")) {
            player.sendMessage(Component.text("No permission to use Sample Stick.", NamedTextColor.RED));
            return;
        }

        long now = System.currentTimeMillis();
        Long last = player.getPersistentDataContainer()
                .get(factory.cooldownKey(), PersistentDataType.LONG);
        if (last != null && now - last < COOLDOWN_MS) {
            long leftMs = COOLDOWN_MS - (now - last);
            player.sendActionBar(
                    Component.text("Cooldown: " + String.format("%.1fs", leftMs / 1000.0), NamedTextColor.GOLD)
            );
            return;
        }

        event.setCancelled(true);

        Vector direction = player.getLocation().getDirection().normalize();
        Vector velocity = direction.multiply(LEAP_STRENGTH).setY(Math.max(direction.getY(), 0) * 0.2 + LEAP_Y);
        player.setVelocity(velocity);
        player.getPersistentDataContainer().set(factory.cooldownKey(), PersistentDataType.LONG, now);

        player.getWorld().playSound(player.getLocation(), Sound.ENTITY_ENDER_DRAGON_FLAP, 0.6f, 1.4f);
        player.sendActionBar(Component.text("Whoosh!", NamedTextColor.AQUA));
    }
}
