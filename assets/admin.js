jQuery(document).ready(function($) {

    // Initialize the interface on page load
    initializeInterface();

    // Handle mode selection changes
    $('input[name="shan_font_settings[mode]"]').on('change', function() {
        var selectedMode = $(this).val();
        var customWeightsSection = $('#custom-weights-section');
        $('.mode-option').removeClass('active');
        $(this).closest('.mode-option').addClass('active');
        customWeightsSection.attr('data-current-mode', selectedMode);

        if (selectedMode === 'custom_selection') {
            customWeightsSection.slideDown(300);
        } else {
            customWeightsSection.slideUp(300);
        }
    });

    // Handle weight selection changes
    $(document).on('change', 'input[name="shan_font_settings[custom_weights][]"]', function() {
        var $checkbox = $(this);
        var weightOption = $checkbox.closest('.weight-option');
        var toggle = weightOption.find('.weight-toggle');

        if ($checkbox.is(':checked')) {
            weightOption.addClass('selected');
            toggle.addClass('active');
        } else {
            weightOption.removeClass('selected');
            toggle.removeClass('active');
        }
        updatePreview();
    });

    function initializeInterface() {
        var currentModeElement = $('input[name="shan_font_settings[mode]"]:checked');
        var currentMode = currentModeElement.length > 0 ? currentModeElement.val() : 'quick_setup';
        var customWeightsSection = $('#custom-weights-section');

        $('.mode-option').removeClass('active');
        if (currentModeElement.length > 0) {
            currentModeElement.closest('.mode-option').addClass('active');
        }
        
        customWeightsSection.attr('data-current-mode', currentMode);

        if (currentMode === 'custom_selection') {
            customWeightsSection.show();
        } else {
            customWeightsSection.hide();
        }

        $('input[name="shan_font_settings[custom_weights][]"]').each(function() {
            var $checkbox = $(this);
            var weightOption = $checkbox.closest('.weight-option');
            var toggle = weightOption.find('.weight-toggle');
            if ($checkbox.is(':checked')) {
                weightOption.addClass('selected');
                toggle.addClass('active');
            } else {
                weightOption.removeClass('selected');
                toggle.removeClass('active');
            }
        });

        if (currentMode === 'custom_selection') {
            updatePreview();
        }
    }

    function updatePreview() {
        var selectedWeights = [];
        $('input[name="shan_font_settings[custom_weights][]"]:checked').each(function() {
            selectedWeights.push($(this).val());
        });
        
        var previewContainer = $('#weight-previews');
        var previewText = 'တူဝ်မႄႈလိၵ်ႈတႆးမီး 19 တူဝ်';
        previewContainer.empty();

        if (selectedWeights.length > 0) {
            selectedWeights.forEach(function(weight) {
                var weightClass = 'font-weight-' + weight;
                var weightName = weight.charAt(0).toUpperCase() + weight.slice(1);
                var previewLine = $('<p class="weight-preview ' + weightClass + '">' + previewText + ' (' + weightName + ')</p>');
                previewContainer.append(previewLine);
            });
        } else {
            previewContainer.html('<p class="preview-empty-state">Select font weights above to see preview</p>');
        }
    }

    // Auto-hide success message after 5 seconds
    setTimeout(function() {
        $('.success-message').fadeOut(500);
    }, 5000);

    // Click anywhere on mode/weight option to toggle
    $(document).on('click', '.mode-option', function(e) {
        if (e.target.type !== 'radio') {
            e.preventDefault();
            var radio = $(this).find('input[type="radio"]');
            if (radio.length > 0 && !radio.is(':checked')) {
                radio.prop('checked', true).trigger('change');
            }
        }
    });

    $(document).on('click', '.weight-option', function(e) {
        if (e.target.type !== 'checkbox') {
            e.preventDefault();
            var checkbox = $(this).find('input[type="checkbox"]');
            var isCurrentlyChecked = checkbox.is(':checked');
            checkbox.prop('checked', !isCurrentlyChecked).trigger('change');
        }
    });
});