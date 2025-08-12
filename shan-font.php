<?php
/**
 * Plugin Name: Shan Font
 * Plugin URI: https://shanfont.com
 * Description: Easily apply Shan font to your WordPress website with customizable font options.
 * Version: 1.0.0
 * Author: TaiDev
 * Author URI: https://yord.dev
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: shan-font
 * Requires at least: 5.0
 * Tested up to: 6.8
 * Requires PHP: 7.4
 *
 * @package ShanFont
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define constants
define('SHAN_FONT_VERSION', '1.0.0');
define('SHAN_FONT_PLUGIN_URL', plugin_dir_url(__FILE__));
define('SHAN_FONT_PLUGIN_PATH', plugin_dir_path(__FILE__));

class ShanFontPlugin {
    
    private $options;
    
    public function __construct() {
        add_action('init', array($this, 'init'));
    }
    
    public function init() {
        // WordPress.org handles translation loading.
        
        // Initialize plugin
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'settings_init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_styles'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        
        // Get plugin options
        $this->options = get_option('shan_font_settings', array('mode' => 'quick_setup'));
        
        // Global font styles are appended via enqueue_frontend_styles().
    }
    
    public function add_admin_menu() {
        add_menu_page(
            __('Shan Font', 'shan-font'),
            __('Shan Font', 'shan-font'),
            'manage_options',
            'shan-font',
            array($this, 'admin_page'),
            SHAN_FONT_PLUGIN_URL . 'assets/shanfont.svg',
            30
        );
    }
    
    public function settings_init() {
        register_setting('shan_font_group', 'shan_font_settings', array($this, 'sanitize_settings'));
        
        add_settings_section(
            'shan_font_section', 
            '', // Empty title to remove internal section heading
            null, 
            'shan-font'
        );
        
        add_settings_field(
            'font_mode', 
            '', // Empty label to remove "Font Mode" label
            array($this, 'font_mode_callback'), 
            'shan-font', 
            'shan_font_section'
        );
    }
    
    public function sanitize_settings($input) {
        $sanitized = array();
        
        if (isset($input['mode'])) {
            $allowed_modes = array('theme_defaults', 'quick_setup', 'custom_selection');
            $sanitized['mode'] = in_array($input['mode'], $allowed_modes) ? sanitize_text_field($input['mode']) : 'quick_setup';
        } else {
            $sanitized['mode'] = 'quick_setup';
        }
        
        if (isset($input['custom_weights']) && is_array($input['custom_weights'])) {
            $allowed_weights = array('light', 'regular', 'bold', 'black');
            $sanitized_weights = array();
            foreach ($input['custom_weights'] as $weight) {
                $clean_weight = sanitize_text_field($weight);
                if (in_array($clean_weight, $allowed_weights)) {
                    $sanitized_weights[] = $clean_weight;
                }
            }
            $sanitized['custom_weights'] = $sanitized_weights;
        } else {
            $sanitized['custom_weights'] = array();
        }

        // Set a transient to show the success message in the form.
        set_transient('shan_font_settings_saved', 'true', 5);
        
        return $sanitized;
    }
    
    public function font_mode_callback() {
        // Determine the current mode and selected weights from saved options.
        $mode    = isset($this->options['mode']) ? $this->options['mode'] : 'quick_setup';
        $weights = isset($this->options['custom_weights']) ? $this->options['custom_weights'] : array();
        $preview_text = 'တူဝ်မႄႈလိၵ်ႈတႆးမီး 19 တူဝ်';

        // Render the mode selection cards.
        ?>

        <div class="shan-font-modes">
            <label class="mode-option <?php echo esc_attr( $mode === 'theme_defaults' ? 'active' : '' ); ?>">
                <input type="radio" name="shan_font_settings[mode]" value="theme_defaults" <?php checked( $mode, 'theme_defaults' ); ?>>
                <div class="mode-content">
                    <strong><?php esc_html_e( 'Theme Defaults', 'shan-font' ); ?></strong>
                    <p><?php esc_html_e( 'ၸႂ်ႉၾွၼ်ႉဢၼ်ၵိုၵ်းမႃးတီႈ theme', 'shan-font' ); ?></p>
                </div>
            </label>

            <label class="mode-option <?php echo esc_attr( $mode === 'quick_setup' ? 'active' : '' ); ?>">
                <input type="radio" name="shan_font_settings[mode]" value="quick_setup" <?php checked( $mode, 'quick_setup' ); ?>>
                <div class="mode-content">
                    <strong><?php esc_html_e( 'Quick Setup', 'shan-font' ); ?></strong>
                    <p><?php esc_html_e( 'ၸႂ်ႉၾွၼ်ႉ Shan', 'shan-font' ); ?></p>
                </div>
            </label>

            <label class="mode-option <?php echo esc_attr( $mode === 'custom_selection' ? 'active' : '' ); ?>">
                <input type="radio" name="shan_font_settings[mode]" value="custom_selection" <?php checked( $mode, 'custom_selection' ); ?>>
                <div class="mode-content">
                    <strong><?php esc_html_e( 'Custom Selection', 'shan-font' ); ?></strong>
                    <p><?php esc_html_e( 'လိူၵ်ႈၾွၼ်ႉဢၼ်တေၸႂ်ႉ', 'shan-font' ); ?></p>
                </div>
            </label>
        </div>

        <div class="shan-font-weights" id="custom-weights-section" data-current-mode="<?php echo esc_attr( $mode ); ?>">
            <div class="weights-header">
                <h3><?php esc_html_e( 'Select Weights', 'shan-font' ); ?></h3>
            </div>

            <div class="weight-options">
                <label class="weight-option <?php echo esc_attr( in_array( 'light', $weights, true ) ? 'selected' : '' ); ?>">
                    <input type="checkbox" name="shan_font_settings[custom_weights][]" value="light" <?php checked( in_array( 'light', $weights, true ) ); ?>>
                    <span class="weight-toggle <?php echo esc_attr( in_array( 'light', $weights, true ) ? 'active' : '' ); ?>"></span>
                    <strong><?php esc_html_e( 'Light', 'shan-font' ); ?></strong>
                </label>

                <label class="weight-option <?php echo esc_attr( in_array( 'regular', $weights, true ) ? 'selected' : '' ); ?>">
                    <input type="checkbox" name="shan_font_settings[custom_weights][]" value="regular" <?php checked( in_array( 'regular', $weights, true ) ); ?>>
                    <span class="weight-toggle <?php echo esc_attr( in_array( 'regular', $weights, true ) ? 'active' : '' ); ?>"></span>
                    <strong><?php esc_html_e( 'Regular', 'shan-font' ); ?></strong>
                </label>

                <label class="weight-option <?php echo esc_attr( in_array( 'bold', $weights, true ) ? 'selected' : '' ); ?>">
                    <input type="checkbox" name="shan_font_settings[custom_weights][]" value="bold" <?php checked( in_array( 'bold', $weights, true ) ); ?>>
                    <span class="weight-toggle <?php echo esc_attr( in_array( 'bold', $weights, true ) ? 'active' : '' ); ?>"></span>
                    <strong><?php esc_html_e( 'Bold', 'shan-font' ); ?></strong>
                </label>

                <label class="weight-option <?php echo esc_attr( in_array( 'black', $weights, true ) ? 'selected' : '' ); ?>">
                    <input type="checkbox" name="shan_font_settings[custom_weights][]" value="black" <?php checked( in_array( 'black', $weights, true ) ); ?>>
                    <span class="weight-toggle <?php echo esc_attr( in_array( 'black', $weights, true ) ? 'active' : '' ); ?>"></span>
                    <strong><?php esc_html_e( 'Black', 'shan-font' ); ?></strong>
                </label>
            </div>

            <div class="font-preview">
                <div class="preview-header">
                    <span class="preview-icon">👁</span>
                    <strong><?php esc_html_e( 'Live Preview', 'shan-font' ); ?></strong>
                </div>
                <div class="preview-text">
                    <div id="weight-previews">
                        <?php if ( ! empty( $weights ) ) : ?>
                            <?php foreach ( $weights as $weight ) : ?>
                                <p class="weight-preview font-weight-<?php echo esc_attr( $weight ); ?>">
                                    <?php echo esc_html( $preview_text ); ?> (<?php echo esc_html( ucfirst( $weight ) ); ?>)
                                </p>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
    
    public function admin_page() {
        require_once SHAN_FONT_PLUGIN_PATH . 'templates/admin-page.php';
    }
    
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'toplevel_page_shan-font') {
            return;
        }
        
        wp_enqueue_style(
            'shan-font-admin',
            SHAN_FONT_PLUGIN_URL . 'assets/admin.css',
            array(),
            SHAN_FONT_VERSION
        );
        
        wp_enqueue_script(
            'shan-font-admin',
            SHAN_FONT_PLUGIN_URL . 'assets/admin.js',
            array('jquery'),
            SHAN_FONT_VERSION,
            true
        );
        
        /*
         * Localize data for the admin script.
         *
         * It's best practice to expose PHP variables to JavaScript via
         * wp_localize_script rather than printing inline <script> tags.  In
         * addition to pluginUrl, nonce and ajaxUrl, we also pass the
         * current mode and the selected font weights so the script can
         * initialize its UI accordingly.  Values are sanitized before
         * being passed to ensure they are safe for output.
         */
        $current_mode    = isset( $this->options['mode'] ) ? sanitize_text_field( $this->options['mode'] ) : 'quick_setup';
        $current_weights = array();
        if ( isset( $this->options['custom_weights'] ) && is_array( $this->options['custom_weights'] ) ) {
            foreach ( $this->options['custom_weights'] as $weight ) {
                $current_weights[] = sanitize_text_field( $weight );
            }
        }

        wp_localize_script(
            'shan-font-admin',
            'shanFontAdmin',
            array(
                'pluginUrl' => SHAN_FONT_PLUGIN_URL,
                'nonce'     => wp_create_nonce( 'shan_font_nonce' ),
                'ajaxUrl'   => admin_url( 'admin-ajax.php' ),
                'currentMode'    => $current_mode,
                'currentWeights' => $current_weights,
            )
        );
    }
    
    public function enqueue_frontend_styles() {
        /*
         * Enqueue front‑end styles only when a custom font mode is selected.
         * The theme_defaults mode intentionally avoids loading any custom
         * fonts so as not to override the theme’s typography.  When a
         * custom mode is active we enqueue our stylesheet and append
         * inline styles for @font‑face declarations and the global font
         * family rules.  Doing this via wp_add_inline_style ensures that
         * the CSS is properly output in the <head> without echoing
         * arbitrary <style> tags.
         */
        if ( isset( $this->options['mode'] ) && $this->options['mode'] !== 'theme_defaults' ) {
            wp_enqueue_style(
                'shan-font-styles',
                SHAN_FONT_PLUGIN_URL . 'assets/frontend.css',
                array(),
                SHAN_FONT_VERSION
            );

            // Add @font-face declarations
            $this->add_font_face_styles();

            // Append the global font family rules if appropriate
            $global_css = $this->get_global_font_css();
            if ( $global_css ) {
                wp_add_inline_style( 'shan-font-styles', $global_css );
            }
        }
    }
    
    private function add_font_face_styles() {
        $css = $this->generate_font_face_css();
        wp_add_inline_style('shan-font-styles', $css);
    }

    /**
     * Build the global font rules used to apply the Shan typeface across
     * the front‑end.  This method returns plain CSS without
     * `<style>` wrappers so it can be passed directly to
     * wp_add_inline_style().  It checks the current mode and only
     * returns a string when the plugin should override the theme
     * typography (i.e. quick_setup or a custom selection with
     * weights).
     *
     * @return string CSS rules for the global font family or an empty string.
     */
    private function get_global_font_css() {
        $mode = isset( $this->options['mode'] ) ? $this->options['mode'] : 'quick_setup';

        // Don't override theme defaults when the mode is theme_defaults.
        if ( 'theme_defaults' === $mode ) {
            return '';
        }

        // In custom_selection mode ensure that at least one weight is selected.
        if ( 'custom_selection' === $mode ) {
            if ( empty( $this->options['custom_weights'] ) || ! is_array( $this->options['custom_weights'] ) ) {
                return '';
            }
        }

        // Construct the CSS rules.  We intentionally leave the font
        // family names as static strings since they are not user‑provided.
        $css = "body, p, h1, h2, h3, h4, h5, h6, div, span, a, li, td, th, input, textarea, select, button {
            font-family: 'Shan', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif !important;
        }";

        return $css;
    }
    
    private function generate_font_face_css() {
        // Determine the selected mode.  Default to quick_setup when
        // nothing has been saved yet.
        $mode = isset( $this->options['mode'] ) ? $this->options['mode'] : 'quick_setup';

        // Build the base font URL and escape it for safety.  Adding
        // trailing slash ensures paths are properly concatenated.
        $fonts_url = trailingslashit( SHAN_FONT_PLUGIN_URL . 'fonts' );
        $fonts_url = esc_url_raw( $fonts_url );

        $css = '';
        
        $font_files = array(
            'thin' => array('Shan-Thin.woff2', 'Shan-ThinItalic.woff2'),
            'regular' => array('Shan-Regular.woff2', 'Shan-Italic.woff2'),
            'bold' => array('Shan-Bold.woff2', 'Shan-BoldItalic.woff2'),
            'black' => array('Shan-Black.woff2', 'Shan-BlackItalic.woff2')
        );
        
        $font_weights = array(
            'thin' => '100',
            'regular' => '400',
            'bold' => '700',
            'black' => '900'
        );
        
        if ( $mode === 'quick_setup' ) {
            // Load all fonts
            foreach ($font_files as $weight => $files) {
                $css .= $this->create_font_face($weight, $files, $fonts_url, $font_weights[$weight]);
            }
        } elseif ( $mode === 'custom_selection' && isset( $this->options['custom_weights'] ) ) {
            // Load only selected fonts
            $selected_weights = $this->options['custom_weights'];
            
            // Map custom selection to font files
            $weight_mapping = array(
                'light' => 'thin',
                'regular' => 'regular',
                'bold' => 'bold',
                'black' => 'black'
            );
            
            foreach ($selected_weights as $selected) {
                if (isset($weight_mapping[$selected]) && isset($font_files[$weight_mapping[$selected]])) {
                    $weight = $weight_mapping[$selected];
                    $css .= $this->create_font_face($weight, $font_files[$weight], $fonts_url, $font_weights[$weight]);
                }
            }
        }
        
        return $css;
    }
    
    private function create_font_face($weight, $files, $fonts_url, $font_weight) {
        $css = '';

        /*
         * Sanitize file names and build fully qualified URLs for the
         * @font-face declarations.  Using esc_url() and
         * sanitize_file_name() prevents malformed or malicious values
         * from being injected into the CSS.  While the provided file
         * names are bundled with the plugin, sanitising them ensures
         * future modifications remain safe.
         */
        $normal_file = sanitize_file_name( isset( $files[0] ) ? $files[0] : '' );
        $italic_file = sanitize_file_name( isset( $files[1] ) ? $files[1] : '' );
        $normal_url  = esc_url( $fonts_url . $normal_file );
        $italic_url  = esc_url( $fonts_url . $italic_file );

        // Normal style
        $css .= "@font-face {
            font-family: 'Shan';
            src: url('{$normal_url}') format('woff2');
            font-weight: {$font_weight};
            font-style: normal;
            font-display: swap;
        }\n";

        // Italic style
        $css .= "@font-face {
            font-family: 'Shan';
            src: url('{$italic_url}') format('woff2');
            font-weight: {$font_weight};
            font-style: italic;
            font-display: swap;
        }\n";

        return $css;
    }
    
    
    // Plugin activation hook
    public static function activate() {
        add_option('shan_font_settings', array('mode' => 'quick_setup'));
    }
    
    // Plugin deactivation hook
    public static function deactivate() {
        // Clean up if needed
    }
    
    // Plugin uninstall hook
    public static function uninstall() {
        delete_option('shan_font_settings');
    }
}

// Initialize the plugin
new ShanFontPlugin();

// Register activation/deactivation hooks
register_activation_hook(__FILE__, array('ShanFontPlugin', 'activate'));
register_deactivation_hook(__FILE__, array('ShanFontPlugin', 'deactivate'));
register_uninstall_hook(__FILE__, array('ShanFontPlugin', 'uninstall'));
?>