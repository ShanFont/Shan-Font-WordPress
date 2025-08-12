<?php
/**
 * Shan Font Admin Page Template
 *
 * @package ShanFont
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wrap shan-font-admin">
    <div class="shan-font-header">
        <div class="plugin-info">
            <img src="<?php echo esc_url(SHAN_FONT_PLUGIN_URL . 'assets/ShanFont.webp'); ?>" alt="Shan Font" class="plugin-logo">
            <div class="plugin-details">
                <h1><?php esc_html_e('Shan Font', 'shan-font'); ?></h1>
                <p class="plugin-url">
                    <a href="https://shanfont.com" target="_blank">www.shanfont.com</a>
                </p>
                <p class="plugin-author"><?php esc_html_e('Developed by TaiDev', 'shan-font'); ?></p>
            </div>
        </div>
    </div>
    
    <div class="shan-font-form-container">
        <form method="post" action="options.php" class="shan-font-form">
            <?php
            settings_fields('shan_font_group');
            wp_nonce_field('shan_font_save_settings', 'shan_font_nonce');
            ?>
            
            <div class="form-section">
                <div class="section-header">
                    <h2><?php esc_html_e('Font Options', 'shan-font'); ?></h2>
                </div>
                
                <div class="section-content">
                    <?php do_settings_sections('shan-font'); ?>
                </div>
            </div>
            
            <div class="form-actions">
                <?php
                // Check if the transient is set, and if so, display the message.
                if (get_transient('shan_font_settings_saved')) {
                    ?>
                    <div class="success-message">
                        <span class="success-icon">✅</span>
                        <?php esc_html_e('Settings saved successfully!', 'shan-font'); ?>
                    </div>
                    <?php
                    // Delete the transient so it doesn't show again on refresh.
                    delete_transient('shan_font_settings_saved');
                }
                ?>
                <button type="submit" class="apply-button">
                    <span class="button-icon">✓</span>
                    <?php esc_html_e('Save & Apply Changes', 'shan-font'); ?>
                </button>
            </div>
        </form>
    </div>
</div>

<?php
/*
 * Previously this template printed an inline <script> tag to expose
 * PHP variables to JavaScript. The WordPress plugin handbook
 * recommends using wp_localize_script() for this purpose instead of
 * echoing scripts directly. The values for the current mode and
 * selected weights are now passed in ShanFontPlugin::enqueue_admin_scripts().
 */
?>