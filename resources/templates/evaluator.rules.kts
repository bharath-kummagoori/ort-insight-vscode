/*
 * ORT Evaluator Rules Template
 *
 * This file defines policy rules that ORT evaluates against your project's dependencies.
 * Customize these rules to match your organization's open source compliance requirements.
 *
 * Usage: ORT Insight > Evaluate Policies (or Ctrl+Shift+P > "ORT Insight: Evaluate Policies")
 *
 * Documentation: https://oss-review-toolkit.org/ort/docs/configuration/evaluator-rules
 */

// Load license categories from license-classifications.yml
val permissiveLicenses = licenseClassifications.licensesByCategory["permissive"].orEmpty()
val copyleftLicenses = licenseClassifications.licensesByCategory["copyleft"].orEmpty()
val strongCopyleftLicenses = licenseClassifications.licensesByCategory["strong-copyleft"].orEmpty()
val copyleftLimitedLicenses = licenseClassifications.licensesByCategory["copyleft-limited"].orEmpty()
val publicDomainLicenses = licenseClassifications.licensesByCategory["public-domain"].orEmpty()
val commercialRestrictedLicenses = licenseClassifications.licensesByCategory["commercial-restricted"].orEmpty()

// Custom matchers for license categorization
fun PackageRule.LicenseRule.isStrongCopyleft() =
    object : RuleMatcher {
        override val description = "isStrongCopyleft($license)"
        override fun matches() = license in strongCopyleftLicenses
    }

fun PackageRule.LicenseRule.isCopyleftLimited() =
    object : RuleMatcher {
        override val description = "isCopyleftLimited($license)"
        override fun matches() = license in copyleftLimitedLicenses
    }

fun PackageRule.LicenseRule.isCommercialRestricted() =
    object : RuleMatcher {
        override val description = "isCommercialRestricted($license)"
        override fun matches() = license in commercialRestrictedLicenses
    }

fun PackageRule.LicenseRule.isPermissive() =
    object : RuleMatcher {
        override val description = "isPermissive($license)"
        override fun matches() = license in permissiveLicenses
    }

fun PackageRule.LicenseRule.isCopyleft() =
    object : RuleMatcher {
        override val description = "isCopyleft($license)"
        override fun matches() = license in copyleftLicenses
    }

fun PackageRule.LicenseRule.isPublicDomain() =
    object : RuleMatcher {
        override val description = "isPublicDomain($license)"
        override fun matches() = license in publicDomainLicenses
    }

// RULE 1: Flag strong copyleft licenses (GPL, AGPL)
fun RuleSet.flagStrongCopyleft() = packageRule("FLAG_STRONG_COPYLEFT") {
    require {
        -isExcluded()
    }

    licenseRule("STRONG_COPYLEFT_IN_DEPENDENCY", LicenseView.CONCLUDED_OR_DECLARED_AND_DETECTED) {
        require {
            +isStrongCopyleft()
        }

        error(
            "Package '${pkg.metadata.id.toCoordinates()}' uses a strong copyleft license: ${license.simpleLicense()}. " +
            "This may require you to release your entire application under the same license.",
            "Review whether this dependency can be replaced with a permissively-licensed alternative, " +
            "or consult your legal team for guidance on GPL/AGPL compliance."
        )
    }
}

// RULE 2: Warn about limited copyleft licenses (LGPL, MPL, EPL)
fun RuleSet.warnCopyleftLimited() = packageRule("WARN_COPYLEFT_LIMITED") {
    require {
        -isExcluded()
    }

    licenseRule("LIMITED_COPYLEFT_WARNING", LicenseView.CONCLUDED_OR_DECLARED_AND_DETECTED) {
        require {
            +isCopyleftLimited()
        }

        warning(
            "Package '${pkg.metadata.id.toCoordinates()}' uses a limited copyleft license: ${license.simpleLicense()}. " +
            "Modifications to this library may need to be shared.",
            "Ensure you are only linking to this library (not modifying it), or review the specific " +
            "obligations of ${license.simpleLicense()} with your legal team."
        )
    }
}

// RULE 3: Flag commercial-restricted licenses (CC-BY-NC, etc.)
fun RuleSet.flagCommercialRestricted() = packageRule("FLAG_COMMERCIAL_RESTRICTED") {
    require {
        -isExcluded()
    }

    licenseRule("NO_COMMERCIAL_RESTRICTED_LICENSES", LicenseView.CONCLUDED_OR_DECLARED_AND_DETECTED) {
        require {
            +isCommercialRestricted()
        }

        error(
            "Package '${pkg.metadata.id.toCoordinates()}' uses license ${license.simpleLicense()} which " +
            "restricts commercial use. This dependency CANNOT be used in commercial products.",
            "Remove this dependency or replace it with an alternative that uses a commercially-compatible license."
        )
    }
}

// RULE 4: Flag packages with no declared license
fun RuleSet.requireDeclaredLicense() = packageRule("REQUIRE_DECLARED_LICENSE") {
    require {
        -isExcluded()
        -hasLicense()
    }

    error(
        "Package '${pkg.metadata.id.toCoordinates()}' has no declared license. " +
        "Without a license, default copyright law applies and the package cannot be legally used.",
        "Contact the package maintainer to add a license, or add a license curation in your ORT configuration."
    )
}

// RULE 5: Warn about packages with uncategorized licenses
fun RuleSet.warnUnmappedLicense() = packageRule("WARN_UNMAPPED_LICENSE") {
    require {
        -isExcluded()
    }

    licenseRule("UNMAPPED_LICENSE", LicenseView.CONCLUDED_OR_DECLARED_AND_DETECTED) {
        require {
            -isPermissive()
            -isCopyleft()
            -isStrongCopyleft()
            -isCopyleftLimited()
            -isPublicDomain()
            -isCommercialRestricted()
        }

        warning(
            "Package '${pkg.metadata.id.toCoordinates()}' uses license ${license.simpleLicense()} " +
            "which is not categorized in your license-classifications.yml.",
            "Add this license to your license-classifications.yml file under the appropriate category, " +
            "or consult your legal team to determine its obligations."
        )
    }
}

// Execute all rules
val ruleSet = ruleSet(ortResult, licenseInfoResolver, resolutionProvider) {
    flagStrongCopyleft()
    warnCopyleftLimited()
    flagCommercialRestricted()
    requireDeclaredLicense()
    warnUnmappedLicense()
}

ruleViolations += ruleSet.violations
