<template>
  <div class="market-page">
    <TitleBar />

    <div class="market-container">
      <header class="page-header">
        <div class="badge-row">
          <span class="badge-dot"></span>
          <span class="badge-text">{{ ui.navBtn }}</span>
        </div>

        <div class="title-stack">
          <h1 class="page-title">
            <span class="market-title-accent">{{ ui.pageTitle1 }}</span> {{ ui.pageTitle2 }}
            <span class="bolt">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="32"
                height="32"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </span>
          </h1>
          <p class="page-desc">{{ ui.subtitle }}</p>
        </div>
      </header>

      <div class="currency-toggle">
        <div class="toggle-bg">
          <button
            class="toggle-btn"
            :class="{ active: currency === 'USD' }"
            @click="currency = 'USD'"
          >
            US USD
          </button>
          <button
            class="toggle-btn"
            :class="{ active: currency === 'CNY' }"
            @click="currency = 'CNY'"
          >
            CN CNY
          </button>
        </div>
      </div>

      <p v-if="packagesLoading || packagesError" class="package-status" role="status" aria-live="polite">
        {{ packagesLoading ? ui.loadingPackages : ui.paidUnavailable }}
      </p>

      <div class="pricing-grid">
        <!-- Starter Pack -->
        <div class="pricing-card" v-if="!proOnly">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="title-row">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="32"
                  height="32"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <circle cx="12" cy="12" r="4"></circle>
                  <line x1="21.17" y1="8" x2="12" y2="8"></line>
                  <line x1="3.95" y1="6.06" x2="8.54" y2="14"></line>
                  <line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>
                </svg>
              </span>
              <h2>{{ ui.starterTitle }}</h2>
            </div>
            <div class="badge standard">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="12"
                height="12"
                style="margin-right: 4px; display: inline-block; vertical-align: middle"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              STANDARD
            </div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(PACK_PRICES.starter) }}</span>
            </div>
            <div class="compute-amount">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              {{ formatCredits(PACK_CREDITS.starter) }} {{ ui.computeUnit }}
            </div>
            
            <div class="btn-container">
              <button
                class="buy-btn"
                type="button"
                :disabled="payCreating || packagesLoading || !PACKAGE_AVAILABLE.starter"
                @click="handleBuy('starter')"
              >
                {{ packageButtonLabel('starter') }}
              </button>
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature1 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature2 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature3 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature4 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature5 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.starterFeature6 }}</span>
            </li>
            <li class="disabled">
              <span class="cross"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line></svg></span
              ><span class="feature-text">{{ ui.starterDisabledPro }}</span>
            </li>
          </ul>
        </div>

        <!-- Standard Pack -->
        <div class="pricing-card" v-if="!proOnly">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="title-row">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="32"
                  height="32"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
              </span>
              <h2>{{ ui.standardTitle }}</h2>
            </div>
            <div class="badge standard">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="12"
                height="12"
                style="margin-right: 4px; display: inline-block; vertical-align: middle"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              STANDARD
            </div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(PACK_PRICES.standard) }}</span>
            </div>
            <div class="compute-amount">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              {{ formatCredits(PACK_CREDITS.standard) }} {{ ui.computeUnit }}
            </div>
            
            <div class="btn-container">
              <button
                class="buy-btn"
                type="button"
                :disabled="payCreating || packagesLoading || !PACKAGE_AVAILABLE.standard"
                @click="handleBuy('standard')"
              >
                {{ packageButtonLabel('standard') }}
              </button>
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.standardFeature1 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
          </ul>
        </div>

        <!-- Professional Pack (Green Theme) -->
        <div class="pricing-card pro-theme">
          <div class="tag-recommend">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="12"
              height="12"
              style="margin-right: 4px; display: inline-block; vertical-align: middle"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              ></path>
            </svg>
            {{ ui.recommend }}
          </div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="title-row">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="32"
                  height="32"
                >
                  <path
                    d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  ></path>
                </svg>
              </span>
              <h2>{{ ui.proTitle }}</h2>
            </div>
            <div class="badge pro">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="12"
                height="12"
                style="margin-right: 4px; display: inline-block; vertical-align: middle"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              PRO ACCESS
            </div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(PACK_PRICES.pro) }}</span>
            </div>
            <div class="compute-amount">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              {{ formatCredits(PACK_CREDITS.pro) }} {{ ui.computeUnit }}
            </div>
            
            <div class="btn-container">
              <button
                class="buy-btn primary"
                type="button"
                :disabled="payCreating || packagesLoading || !PACKAGE_AVAILABLE.pro"
                @click="handleBuy('pro')"
              >
                {{ packageButtonLabel('pro') }}
              </button>
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.proFeature1 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro1 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro2 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro3 }}</span>
            </li>
          </ul>
        </div>

        <!-- Ultimate Pack (Gold Theme) -->
        <div class="pricing-card ultimate-theme">
          <div class="tag-recommend gold">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              width="12"
              height="12"
              style="margin-right: 4px; display: inline-block; vertical-align: middle"
            >
              <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
            </svg>
            {{ ui.ultimateTag }}
          </div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="title-row">
              <span class="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="32"
                  height="32"
                >
                  <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
                </svg>
              </span>
              <h2>{{ ui.ultimateTitle }}</h2>
            </div>
            <div class="badge ultimate">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="12"
                height="12"
                style="margin-right: 4px; display: inline-block; vertical-align: middle"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              PRO ACCESS
            </div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(PACK_PRICES.ultimate) }}</span>
            </div>
            <div class="compute-amount">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              {{ formatCredits(PACK_CREDITS.ultimate) }} {{ ui.computeUnit }}
            </div>
            
            <div class="btn-container">
              <button
                class="buy-btn gold"
                type="button"
                :disabled="payCreating || packagesLoading || !PACKAGE_AVAILABLE.ultimate"
                @click="handleBuy('ultimate')"
              >
                {{ packageButtonLabel('ultimate') }}
              </button>
            </div>
          </div>

          <ul class="features">
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.ultimateFeature1 }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonLicense }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonOwnership }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonExports }}</span>
            </li>
            <li>
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.commonModelBase }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard1 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard2 }}</span>
            </li>
            <li class="tier-standard">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierStandard3 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro1 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro2 }}</span>
            </li>
            <li class="tier-pro">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierPro3 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierUltimate1 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierUltimate2 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierUltimate3 }}</span>
            </li>
            <li class="tier-ultimate">
              <span class="check"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="16"
                  height="16"
                >
                  <polyline points="20 6 9 17 4 12"></polyline></svg></span
              ><span class="feature-text">{{ ui.tierUltimate4 }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Info Section (SEO) -->
    <div class="info-section">
      <div class="info-container">
        <h2 class="info-title">{{ ui.contentTitle }}</h2>
        <p class="info-desc">{{ ui.contentDesc }}</p>

        <div class="info-grid">
          <div class="info-card">
            <div class="info-card-title">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
                style="margin-right: 6px"
              >
                <polyline points="9 18 15 12 9 6"></polyline></svg
              >{{ ui.useCasesTitle }}
            </div>
            <ul class="info-list">
              <li v-for="(item, idx) in ui.useCases" :key="idx" class="info-list-item">
                <span class="info-list-icon"
                  ><svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="14"
                    height="14"
                  >
                    <line x1="4" y1="9" x2="20" y2="9"></line>
                    <line x1="4" y1="15" x2="20" y2="15"></line>
                    <line x1="10" y1="3" x2="8" y2="21"></line>
                    <line x1="16" y1="3" x2="14" y2="21"></line></svg
                ></span>
                {{ item }}
              </li>
            </ul>
          </div>

          <div class="info-card">
            <div class="info-card-title">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
                style="margin-right: 6px"
              >
                <polyline points="9 18 15 12 9 6"></polyline></svg
              >{{ ui.longTailTitle }}
            </div>
            <div class="info-chips">
              <span v-for="(chip, idx) in ui.longTailKeywords" :key="idx" class="info-chip">
                {{ chip }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FAQ Section -->
    <div class="faq-section faq-mobile-pad">
      <div class="faq-left">
        <div class="faq-title-large">{{ ui.faqTitle }}</div>
        <div class="faq-subtitle">{{ ui.faqSubtitle }}</div>
      </div>
      <div class="faq-list">
        <details v-for="f in ui.faqs" :key="f.q" class="faq-item">
          <summary class="faq-q">
            <span class="q-text">{{ f.q }}</span>
            <span class="q-icon"
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line></svg
            ></span>
          </summary>
          <div class="faq-a-wrapper">
            <div class="faq-a">{{ f.a }}</div>
          </div>
        </details>
      </div>
    </div>

    <GlobalFooter />

    <Teleport to="body">
      <div v-if="payOpen" class="pay-modal" @mousedown.self="closePay">
        <div class="pay-panel" role="dialog" aria-modal="true">
          <div class="pay-head">
            <div class="pay-title">{{ ui.payTitle }}</div>
            <button class="pay-close" type="button" @click="closePay">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="20"
                height="20"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="pay-body">
            <div class="pay-sub">{{ ui.paySub }}</div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payUserIdLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ payUserId }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payUserId === '--'"
                  @click="copyPayValue(payUserId, 'userId')"
                >
                  {{ copiedKey === 'userId' ? ui.copied : ui.copy }}
                </button>
              </div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payOrderIdLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ payOrderIdText }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payOrderIdText === '--'"
                  @click="copyPayValue(payOrderIdText, 'orderId')"
                >
                  {{ copiedKey === 'orderId' ? ui.copied : ui.copy }}
                </button>
              </div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payPackageLabel }}</div>
              <div class="pay-mono">{{ payPackageText }}</div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payCreditsLabel }}</div>
              <div class="pay-mono">+{{ payCreditsText }}</div>
            </div>

            <div class="pay-row">
              <div class="pay-label">{{ ui.payBalanceLabel }}</div>
              <div class="pay-value">
                <div class="pay-mono">{{ latestCreditsText }}</div>
                <button
                  class="pay-copy"
                  type="button"
                  :disabled="payRefreshing"
                  @click="refreshBalanceOnce"
                >
                  {{ payRefreshing ? ui.refreshing : ui.refresh }}
                </button>
              </div>
            </div>

            <div class="pay-actions">
              <button class="nth-login-btn" type="button" :disabled="!payUrl" @click="openPayUrl">
                {{ ui.openPayPage }}
              </button>
              <button
                class="nth-login-btn primary"
                type="button"
                :disabled="payChecking || payRefreshing"
                @click="checkPaidOnce"
              >
                {{ payChecking ? ui.checkingPaid : ui.iHavePaid }}
              </button>
            </div>

            <div
              class="pay-hint"
              :class="{ ok: payStatus === 'success', error: payStatus === 'failed' }"
            >
              {{ payHintText }}
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import GlobalFooter from '../components/GlobalFooter.vue';
import TitleBar from '../components/TitleBar.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { useRoute, useRouter } from 'vue-router';
import {
  createPayOrder,
  getCreditsBalance,
  getPayOrder,
  getPayPackages,
  type PayPackageId
} from '@/points';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { useConsoleStore } from '@/stores/console';
import { trackEvent } from '@/utils/analytics';

const PACK_CREDITS = reactive<Record<PayPackageId, number>>({
  starter: 400,
  standard: 1000,
  pro: 3000,
  ultimate: 10000
});

const PACK_PRICES = reactive<Record<PayPackageId, number>>({
  starter: 9.9,
  standard: 19.9,
  pro: 49.9,
  ultimate: 99.9
});

const PACKAGE_AVAILABLE = reactive<Record<PayPackageId, boolean>>({
  starter: false,
  standard: false,
  pro: false,
  ultimate: false
});
const PACKAGE_UUIDS = reactive<Record<PayPackageId, string>>({
  starter: '',
  standard: '',
  pro: '',
  ultimate: ''
});
const packagesLoading = ref(true);
const packagesError = ref(false);

const loadPackageCatalogue = async () => {
  packagesLoading.value = true;
  packagesError.value = false;
  for (const key of Object.keys(PACKAGE_AVAILABLE) as PayPackageId[]) {
    PACKAGE_AVAILABLE[key] = false;
    PACKAGE_UUIDS[key] = '';
  }
  const packages = await getPayPackages();
  if (!packages) {
    packagesError.value = true;
    packagesLoading.value = false;
    return;
  }
  for (const item of packages) {
    PACK_CREDITS[item.packageId] = item.credits;
    PACK_PRICES[item.packageId] = item.amountCny;
    PACKAGE_UUIDS[item.packageId] = item.packageUuid;
    PACKAGE_AVAILABLE[item.packageId] = true;
  }
  packagesLoading.value = false;
};

const formatCredits = (n: number) => {
  const v = Number(n || 0) || 0;
  return v.toLocaleString();
};

const currency = ref<'CNY' | 'USD'>('CNY');

const currencySymbol = computed(() => (currency.value === 'CNY' ? '¥' : '$'));
const exchangeRate = 0.14; // Approximate CNY to USD rate

const getPrice = (cnyPrice: number) => {
  if (currency.value === 'CNY') {
    return cnyPrice.toFixed(2);
  } else {
    return (cnyPrice * exchangeRate).toFixed(2);
  }
};

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loginStore = useLoginModel();
const consoleStore = useConsoleStore();

const route = useRoute();
const router = useRouter();

const proOnly = computed(() => {
  const raw = String((route.query as any)?.proOnly || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true';
});

const payOpen = ref(false);
const payChecking = ref(false);
const payRefreshing = ref(false);
const payCreating = ref(false);
const buyingPackageId = ref<PayPackageId | ''>('');
const copiedKey = ref<'userId' | 'orderId' | ''>('');
const payStatus = ref<'idle' | 'polling' | 'success' | 'failed'>('idle');
const payError = ref('');
const payOrderId = ref('');
const payPackageId = ref<PayPackageId | ''>('');
const payCredits = ref(0);
const payUrl = ref('');
const baselineCredits = ref<number | null>(null);
const latestCredits = ref<number | null>(null);

const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const pollTick = ref(0);

let pollTimer: number | null = null;
let pollStartedAt = 0;

const stopPolling = () => {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = null;
};

const closePay = () => {
  stopPolling();
  pollStartedAt = 0;
  pollTick.value = 0;
  payOpen.value = false;
  payChecking.value = false;
  payRefreshing.value = false;
  payStatus.value = 'idle';
  payError.value = '';
  payOrderId.value = '';
  payPackageId.value = '';
  payCredits.value = 0;
  payUrl.value = '';
  baselineCredits.value = null;
  latestCredits.value = null;
};

const onKeyDown = (e: KeyboardEvent) => {
  if (!payOpen.value) return;
  if (e.key === 'Escape') closePay();
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  void loadPackageCatalogue();
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen/market',
    meta: { referrer: document.referrer }
  });
});

onBeforeUnmount(() => {
  stopPolling();
  window.removeEventListener('keydown', onKeyDown);
});

const payUserId = computed(() => {
  const uid = String(getCurrentUserId() || '').trim();
  return uid || '--';
});

const payCreditsText = computed(() => String(Number(payCredits.value || 0)));

const payOrderIdText = computed(() => {
  const id = String(payOrderId.value || '').trim();
  return id || '--';
});

const payPackageText = computed(() => {
  const pid = String(payPackageId.value || '').trim();
  if (!pid) return '--';
  return pid;
});

const latestCreditsText = computed(() => {
  const v = latestCredits.value;
  if (typeof v !== 'number') return '--';
  return String(Number(v) || 0);
});

const pollRemainingSec = computed(() => {
  if (payStatus.value !== 'polling') return null;
  if (!pollStartedAt) return null;
  const nowMs = Date.now() + pollTick.value * 0;
  const remainingMs = POLL_TIMEOUT_MS - (nowMs - pollStartedAt);
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
});

const payHintText = computed(() => {
  const raw = String(payError.value || '').trim();
  if (raw) {
    if (raw === 'LOGIN_REQUIRED') return ui.value.payLoginRequired;
    if (raw === 'PAID_FEATURES_DISABLED' || raw === 'DATABASE_NOT_CONFIGURED') {
      return ui.value.paidUnavailable;
    }
    if (raw === 'INVALID_PACKAGE') return ui.value.payInvalidPackage;
    if (raw === 'CREATE_ORDER_FAILED') return ui.value.payCreateFailed;
    if (raw === 'INVALID_RESPONSE') return ui.value.payCreateFailed;
    if (raw === 'NETWORK_ERROR') return ui.value.payNetworkError;
    if (raw === 'ORDER_REJECTED') return ui.value.payRejected;
    if (raw === 'ORDER_CANCELLED') return ui.value.payCancelled;
    if (raw === 'ORDER_EXPIRED') return ui.value.payExpired;
    return raw;
  }
  if (payStatus.value === 'success') {
    const base = baselineCredits.value;
    const cur = latestCredits.value;
    const delta =
      typeof base === 'number' && typeof cur === 'number' && cur > base ? cur - base : null;
    const add = typeof delta === 'number' && delta > 0 ? String(delta) : payCreditsText.value;
    return currentLang.value === 'zh'
      ? `到账成功：+${add} 点数，余额已更新。`
      : `Success: +${add} credits. Balance updated.`;
  }
  if (payStatus.value === 'failed') return ui.value.payTimeout;
  if (payStatus.value === 'polling') {
    const sec = pollRemainingSec.value;
    return typeof sec === 'number' ? `${ui.value.payPolling} (${sec}s)` : ui.value.payPolling;
  }
  return ui.value.payGuide;
});

const openPayUrl = () => {
  const u = String(payUrl.value || '').trim();
  if (!u) return;
  trackEvent('market_open_pay_url', { category: 'conversion', orderId: payOrderId.value });
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/market',
    target: 'open_pay_url_btn',
    meta: { orderId: payOrderId.value }
  });
  try {
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (!w) window.location.assign(u);
  } catch {
    window.location.assign(u);
  }
};

const openPayLoadingWindow = () => {
  try {
    const w = window.open('', '_blank');
    if (!w) return null;
    const title = ui.value.payOpeningTitle;
    const desc = ui.value.payOpeningDesc;
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{margin:0;background:#050505;color:#e2e8f0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px}
  .card{max-width:520px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(12,12,12,.92);box-shadow:0 20px 50px rgba(0,0,0,.6)}
  .inner{padding:28px 26px;text-align:center}
  .title{font-size:20px;font-weight:800;letter-spacing:-.3px;margin-bottom:10px;color:#ccff00}
  .desc{font-size:13px;line-height:1.7;color:#94a3b8}
  .dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:#ccff00;margin:0 4px;box-shadow:0 0 12px rgba(204,255,0,.8)}
  .dots{margin-top:16px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="inner">
        <div class="title">${title}</div>
        <div class="desc">${desc}</div>
        <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      </div>
    </div>
  </div>
</body>
</html>`;
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch {}
    return w;
  } catch {
    return null;
  }
};

const refreshBalance = async () => {
  const bal = await getCreditsBalance();
  latestCredits.value = bal ? Number(bal.available ?? 0) || 0 : null;
  return latestCredits.value;
};

const refreshBalanceOnce = async () => {
  if (payRefreshing.value) return;
  payRefreshing.value = true;
  try {
    const cur = await refreshBalance();
    if (typeof baselineCredits.value !== 'number' && typeof cur === 'number')
      baselineCredits.value = cur;
  } finally {
    payRefreshing.value = false;
  }
};

const copyPayValue = async (value: string, key: 'userId' | 'orderId') => {
  const v = String(value || '').trim();
  if (!v || v === '--') return;
  try {
    await navigator.clipboard.writeText(v);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = '';
    }, 1500);
  } catch {}
};

const checkPaidOnce = async () => {
  if (!payOrderId.value) return;
  trackEvent('market_check_paid_click', { category: 'conversion', orderId: payOrderId.value });
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/market',
    target: 'check_paid_btn',
    meta: { orderId: payOrderId.value }
  });

  payChecking.value = true;
  try {
    await pollPaymentOrder();
  } finally {
    payChecking.value = false;
  }
};

let paymentPollInFlight = false;
const pollPaymentOrder = async () => {
  if (paymentPollInFlight || !payOrderId.value) return;
  const orderId = payOrderId.value;
  paymentPollInFlight = true;
  try {
    const order = await getPayOrder(orderId);
    if (!payOpen.value || payOrderId.value !== orderId) return;
    if (!order) return;
    if (order.status === 'paid') {
      await refreshBalance();
      payStatus.value = 'success';
      stopPolling();
      return;
    }
    if (order.status === 'expired' || order.status === 'cancelled' || order.status === 'rejected') {
      payError.value = `ORDER_${order.status.toUpperCase()}`;
      payStatus.value = 'failed';
      stopPolling();
    }
  } finally {
    paymentPollInFlight = false;
  }
};

const startPolling = () => {
  stopPolling();
  pollStartedAt = Date.now();
  pollTick.value = 0;
  payStatus.value = 'polling';
  pollTimer = window.setInterval(async () => {
    pollTick.value++;
    await pollPaymentOrder();
    if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
      payStatus.value = 'failed';
      stopPolling();
    }
  }, 4000);
  void pollPaymentOrder();
};

const ensureAuthed = (afterLogin: () => void | Promise<void>) => {
  if (isLocalLoggedIn()) return true;
  loginStore.open({ mode: 'login', returnTo: router.currentRoute.value.fullPath, afterLogin });
  return false;
};

const handleBuy = async (packageId: PayPackageId) => {
  if (payCreating.value) return;
  if (!PACKAGE_AVAILABLE[packageId]) {
    payError.value = 'PAID_FEATURES_DISABLED';
    payOpen.value = true;
    return;
  }
  const ok = ensureAuthed(() => handleBuy(packageId));
  if (!ok) return;

  // Pre-open window to bypass popup blocker
  let newWindow: Window | null = null;
  try {
    newWindow = openPayLoadingWindow();
  } catch {}

  payError.value = '';
  payChecking.value = false;
  payRefreshing.value = false;
  payCreating.value = true;
  buyingPackageId.value = packageId;

  try {
    const created = await createPayOrder(packageId, PACKAGE_UUIDS[packageId]);
    if (!created.ok) {
      if (newWindow) newWindow.close();
      payError.value = created.error;
      payOpen.value = true;
      return;
    }
    payOrderId.value = created.orderId;
    payPackageId.value = created.packageId;
    payCredits.value = created.credits;
    payUrl.value = created.payUrl;
    payOpen.value = true;

    const bal = await getCreditsBalance();
    baselineCredits.value = bal ? Number(bal.available ?? 0) || 0 : null;
    latestCredits.value = baselineCredits.value;

    if (payUrl.value) {
      if (newWindow && !newWindow.closed) {
        try {
          newWindow.location.replace(payUrl.value);
        } catch {
          openPayUrl();
        }
      } else openPayUrl();
    } else {
      if (newWindow) newWindow.close();
    }
    startPolling();
  } catch {
    if (newWindow) newWindow.close();
  } finally {
    payCreating.value = false;
    buyingPackageId.value = '';
  }
};

const ui = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      pageTitle1: '点数',
      pageTitle2: '商城',
      subtitle: ' 选择适合你的点数包',
      navBtn: '点数商城',
      myOrders: '我的订单',
      creditsUsage: '点数明细',
      computeUnit: '点数',
      buyNow: '立即购买',
      loadingPackages: '正在读取服务端套餐…',
      paidUnavailable: '付费功能当前不可用',
      creatingOrder: '创建订单中...',
      activateNow: '立即激活',
      recommend: '推荐',
      ultimateTag: '旗舰版',
      starterTitle: '入门包',
      standardTitle: '标准包',
      proTitle: '专业包',
      ultimateTitle: '旗舰包',
      starterFeature1: `${PACK_CREDITS.starter} 点数（一次性点数包）`,
      starterFeature2: '使用权取决于输入素材与模型条款',
      starterFeature3: '同源安全会话，不在浏览器保存凭证',
      starterFeature4: '任务成功后提供结果下载',
      starterFeature5: '生成前展示服务端报价',
      starterFeature6: '可用模型以任务确认页为准',
      starterDisabledPro: '高成本任务可能需要更多点数',
      commonLicense: '发布前请核对素材与模型使用条款',
      commonOwnership: '用户须确保输入素材具有必要权利',
      commonExports: '任务成功后提供结果下载',
      commonModelBase: '模型与规格以任务确认页为准',
      tierStandard1: '服务端报价并锁定本次任务价格',
      tierStandard2: '失败或取消会释放预占点数',
      tierStandard3: '同一任务幂等处理，不重复扣费',
      tierPro1: '单次购买，不是按月订阅',
      tierPro2: '点数仅按实际确认的任务消耗',
      tierPro3: '订单状态可在“我的订单”查询',
      tierUltimate1: '支付回调验签后才会入账',
      tierUltimate2: '套餐和金额以服务端订单为准',
      tierUltimate3: '付费能力不可用时禁止下单',
      tierUltimate4: '任务结果与扣费收据可追踪',
      standardFeature1: `${PACK_CREDITS.standard} 点数（一次性点数包）`,
      proFeature1: `${PACK_CREDITS.pro} 点数（一次性点数包）`,
      ultimateFeature1: `${PACK_CREDITS.ultimate} 点数（一次性点数包）`,
      contentTitle: '创作指南',
      contentDesc: '专业级 AI 绘画平台，释放您的无限创意。',
      useCasesTitle: '应用场景',
      useCases: [
        '自媒体运营 (小红书/公众号配图)',
        '品牌设计 (Logo/海报/包装)',
        '游戏开发 (角色立绘/场景概念)',
        '电商营销 (商品图/AI 模特)',
        '个人娱乐 (二次元头像/壁纸)'
      ],
      longTailTitle: '热门关键词',
      longTailKeywords: [
        'AI绘画',
        'Stable Diffusion',
        'Midjourney平替',
        '二次元',
        '文生图',
        '图生图',
        '4K高清',
        '写实人像'
      ],
      faqTitle: '常见问题',
      faqSubtitle: '关于版权、画质与充值的解答',
      faqs: [
        {
          q: '生成的图片可以商用吗？',
          a: '不能由点数包一概授权。是否可商用取决于输入素材权利、所选模型及其服务条款，请在发布前自行核对。'
        },
        {
          q: '生成失败会扣点数吗？',
          a: '不会。如果因系统原因导致生成失败，点数会自动退回您的账户。'
        },
        {
          q: '如何获得更高清的图片？',
          a: '实际输出分辨率取决于所选工具、模型和任务确认页；点数包本身不承诺固定 4K 输出。'
        },
        {
          q: '什么是优先队列（最快）？',
          a: '当前点数包不承诺专属优先队列；任务状态和等待进度会在执行界面显示。'
        },
        {
          q: '购买后多久到账？',
          a: '一般会在支付成功后自动到账；如偶发延迟，可在弹窗里点击“我已支付，检查到账”。'
        },
        {
          q: '点数怎么消耗？一次大概多少？',
          a: '每次生成会按任务类型扣点数；具体扣费会在生成按钮上显示预计消耗。生成失败因系统原因会自动退回。'
        },
        {
          q: '支持手机端使用吗？',
          a: '支持常见手机和平板浏览器；大型本地图片处理仍取决于设备内存与浏览器能力。'
        },
        { q: '点数有效期是多久？', a: '当前钱包中的已购买点数不设置到期时间；若未来推出有期限的赠送点，会在活动规则中单独标明。' }
      ],
      payTitle: '完成支付',
      paySub:
        '打开支付页面后通常无需手动填写备注；如支付页未自动带出订单信息，可粘贴：userId=<你的用户ID> orderId=<订单号>。支付完成后系统会自动检测到账。',
      payOpeningTitle: '正在打开爱发电',
      payOpeningDesc: '网络波动时可能需要稍等，页面会自动跳转到支付页。',
      payUserIdLabel: '用户ID',
      payOrderIdLabel: '订单号',
      payPackageLabel: '套餐',
      payCreditsLabel: '到账点数',
      payBalanceLabel: '当前点数',
      copy: '复制',
      copied: '已复制',
      refresh: '刷新',
      refreshing: '刷新中...',
      openPayPage: '打开支付页面',
      iHavePaid: '我已支付，检查到账',
      checkingPaid: '检查中...',
      payGuide: '等待支付完成…',
      payPolling: '正在检测到账…',
      paySuccess: '到账成功。',
      payTimeout: '检测超时：如已支付请稍后再试或联系客服。',
      payLoginRequired: '请先登录再购买。',
      payInvalidPackage: '套餐无效，请刷新页面后重试。',
      payCreateFailed: '创建订单失败，请稍后重试。',
      payNetworkError: '网络错误，请检查网络后重试。',
      payRejected: '支付订单被拒绝，未增加点数。',
      payCancelled: '支付订单已取消。',
      payExpired: '支付订单已过期，请重新创建。'
    };
  }
  return {
    pageTitle1: 'Buy',
    pageTitle2: 'Credits',
    subtitle: ' Choose the right credit pack for you',
    navBtn: 'Credits Market',
    myOrders: 'My Orders',
    creditsUsage: 'Credits Usage',
    computeUnit: 'Credits',
    buyNow: 'Buy Now',
    loadingPackages: 'Loading server catalogue…',
    paidUnavailable: 'Paid features unavailable',
    creatingOrder: 'Creating...',
    activateNow: 'Activate Now',
    recommend: 'Recommended',
    ultimateTag: 'Ultimate',
    starterTitle: 'Starter',
    standardTitle: 'Standard',
    proTitle: 'Pro',
    ultimateTitle: 'Ultimate',
    starterFeature1: `${PACK_CREDITS.starter} credits`,
    starterFeature2: 'Usage rights depend on inputs and model terms',
    starterFeature3: 'Secure same-origin sessions; no browser credentials',
    starterFeature4: 'Download results after a successful task',
    starterFeature5: 'Server quote shown before generation',
    starterFeature6: 'Available models are shown at confirmation',
    starterDisabledPro: 'High-cost tasks may require more credits',
    commonLicense: 'Review source and model terms before publishing',
    commonOwnership: 'You must hold the necessary input rights',
    commonExports: 'Download results after a successful task',
    commonModelBase: 'Models and output specs are confirmed per task',
    tierStandard1: 'Server-side quote locked for each task',
    tierStandard2: 'Failed or cancelled tasks release held credits',
    tierStandard3: 'Idempotent tasks are never charged twice',
    tierPro1: 'One-time credit pack, not a subscription',
    tierPro2: 'Credits are spent only on confirmed tasks',
    tierPro3: 'Track status in My Orders',
    tierUltimate1: 'Credits post only after webhook verification',
    tierUltimate2: 'Package and amount come from the server order',
    tierUltimate3: 'Checkout is disabled when billing is unavailable',
    tierUltimate4: 'Task results and billing receipts are traceable',
    standardFeature1: `${PACK_CREDITS.standard} credits (one-time pack)`,
    proFeature1: `${PACK_CREDITS.pro} credits (one-time pack)`,
    ultimateFeature1: `${PACK_CREDITS.ultimate} credits (one-time pack)`,
    contentTitle: 'Creative Guide',
    contentDesc: 'Professional AI art platform to unleash your creativity.',
    useCasesTitle: 'Use Cases',
    useCases: [
      'Social Media (Instagram/TikTok)',
      'Brand Design (Logo/Poster)',
      'Game Assets (Characters/Scenes)',
      'E-commerce (Product Photos/AI Models)',
      'Personal Fun (Avatars/Wallpapers)'
    ],
    longTailTitle: 'Popular Keywords',
    longTailKeywords: [
      'AI Art',
      'Stable Diffusion',
      'Midjourney Alternative',
      'Anime',
      'Text-to-Image',
      'Img-to-Img',
      '4K HD',
      'Photorealistic'
    ],
    faqTitle: 'FAQs',
    faqSubtitle: 'Answers about copyright, quality, and credits',
    faqs: [
      {
        q: 'Can I use images commercially?',
        a: 'A credit pack cannot grant blanket rights. Commercial use depends on your input rights, the selected model, and its provider terms.'
      },
      {
        q: 'Will failed generations cost credits?',
        a: 'No. Credits are automatically refunded if generation fails due to system errors.'
      },
      {
        q: 'How to get higher resolution?',
        a: 'Resolution depends on the selected tool, model, and task confirmation. Credit packs do not promise a fixed 4K output.'
      },
      {
        q: 'What is the Priority Queue (fastest)?',
        a: 'Current credit packs do not promise a dedicated priority queue. The task screen shows execution state and progress.'
      },
      {
        q: 'How fast will credits be delivered after payment?',
        a: 'Credits are usually delivered automatically right after payment. If there is a delay, click “I have paid, check now” in the payment modal.'
      },
      {
        q: 'How are credits charged per generation?',
        a: 'Credits are charged per task type. The estimated cost is shown on the generate button before you run it. System-failed generations are automatically refunded.'
      },
      {
        q: 'Is it mobile friendly?',
        a: 'Common mobile and tablet browsers are supported. Large local media jobs still depend on device memory and browser capabilities.'
      },
      {
        q: 'Do credits expire?',
        a: 'Purchased wallet credits currently have no expiry. Any future time-limited bonus credits will state that explicitly in their campaign terms.'
      }
    ],
    payTitle: 'Complete Payment',
    paySub:
      'Usually no manual remark is needed. If the payment page does not show order info, paste: userId=<your userId> orderId=<orderId>. We will auto-detect credits.',
    payOpeningTitle: 'Opening Afdian',
    payOpeningDesc: 'Network delays may occur. You will be redirected automatically.',
    payUserIdLabel: 'UserId',
    payOrderIdLabel: 'OrderId',
    payPackageLabel: 'Package',
    payCreditsLabel: 'Credits',
    payBalanceLabel: 'Current credits',
    copy: 'Copy',
    copied: 'Copied',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    openPayPage: 'Open payment page',
    iHavePaid: 'I have paid, check now',
    checkingPaid: 'Checking...',
    payGuide: 'Waiting for payment…',
    payPolling: 'Checking credits…',
    paySuccess: 'Success.',
    payTimeout: 'Timeout. If paid, try again later.',
    payLoginRequired: 'Please log in before purchasing.',
    payInvalidPackage: 'Invalid package. Refresh and try again.',
    payCreateFailed: 'Failed to create order. Please try again later.',
    payNetworkError: 'Network error. Please try again.',
    payRejected: 'The payment order was rejected; no credits were added.',
    payCancelled: 'The payment order was cancelled.',
    payExpired: 'The payment order expired. Create a new order.'
  };
});

const packageButtonLabel = (packageId: PayPackageId) => {
  if (buyingPackageId.value === packageId) return ui.value.creatingOrder;
  if (packagesLoading.value) return ui.value.loadingPackages;
  if (!PACKAGE_AVAILABLE[packageId]) return ui.value.paidUnavailable;
  return ui.value.buyNow;
};
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.top-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: rgba(5, 5, 5, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.top-logo {
  text-decoration: none;
}

.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav-item {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-nav-item:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.top-nav-item.active {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.15);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-action-link {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-action-link:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.market-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: var(--common-font);
  padding-top: 0;
  background-image:
    linear-gradient(rgba(204, 255, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(204, 255, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.market-container {
  max-width: 1520px;
  margin: 0 auto;
  padding: 0 24px;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  row-gap: 20px;
  margin-top: 60px;
  margin-bottom: 60px;
  align-items: start;
}

.badge-row {
  grid-column: 1;
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 10px;
}

.badge-dot {
  width: 8px;
  height: 8px;
  background: #ccff00;
  border-radius: 50%;
  box-shadow: 0 0 8px #ccff00;
}

.badge-text {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #ccff00;
}

.title-stack {
  grid-column: 1 / -1;
  justify-self: center;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.page-title {
  font-size: 40px;
  font-weight: 900;
  margin: 0;
  letter-spacing: -1px;
}

.market-title-accent {
  color: var(--neon-green);
  text-shadow: 0 0 18px rgba(204, 255, 0, 0.28);
}

.bolt {
  color: #ffd700;
  display: inline-block;
  animation: pulse 2s infinite;
}

.page-desc {
  color: #64748b;
  font-family: var(--common-font);
  font-size: 18px;
  margin: 0;
  max-width: 860px;
}

/* Currency Toggle */
.currency-toggle {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.package-status {
  min-height: 44px;
  margin: 0 auto 16px;
  padding: 10px 16px;
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 10px;
  color: #fbbf24;
  background: rgba(120, 53, 15, 0.18);
  text-align: center;
  line-height: 24px;
}

.toggle-bg {
  background: #1e1e1e;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  gap: 4px;
  border: 1px solid #333;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #666;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
}

.toggle-btn.active {
  background: #ccff00;
  color: #000;
  box-shadow: 0 2px 10px rgba(204, 255, 0, 0.2);
}

/* Pricing Grid */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 80px;
}

.pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 24px 20px;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s;
  cursor: pointer;
}

.pricing-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border-color: rgba(204, 255, 0, 0.3);
}

.pricing-card:active {
  transform: translateY(-2px) scale(0.99);
}

/* Card Corners */
.card-corner {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.pricing-card:hover .card-corner {
  border-color: #666;
}

.top-left {
  top: -1px;
  left: -1px;
  border-top: 2px solid #333;
  border-left: 2px solid #333;
}
.top-right {
  top: -1px;
  right: -1px;
  border-top: 2px solid #333;
  border-right: 2px solid #333;
}
.bottom-left {
  bottom: -1px;
  left: -1px;
  border-bottom: 2px solid #333;
  border-left: 2px solid #333;
}
.bottom-right {
  bottom: -1px;
  right: -1px;
  border-bottom: 2px solid #333;
  border-right: 2px solid #333;
}

/* Card Content */
.card-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.icon {
  font-size: 24px;
  display: flex;
  align-items: center;
}

.pricing-card h2 {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  color: #fff;
}

.pack-en {
  color: #64748b;
  font-size: 14px;
  font-family: var(--common-font);
  margin-bottom: 12px;
}

.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  margin-bottom: 24px;
  align-self: flex-start;
}

.badge.standard {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.badge.pro {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge.ultimate {
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

/* Price Section */
.price-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.price {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  justify-content: flex-start;
  gap: 4px;
}

.price .symbol {
  font-size: 20px;
  color: #64748b;
}

.compute-amount {
  color: #ccff00;
  font-family: var(--common-font);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  margin-bottom: 20px;
  width: 100%;
}

.pro-theme .compute-amount {
  color: #10b981;
}

.ultimate-theme .compute-amount {
  color: #ffd700;
}

.btn-container {
  width: 100%;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 24px;
}

.pro-theme .btn-container {
  border-top-color: rgba(16, 185, 129, 0.2);
  border-bottom-color: rgba(16, 185, 129, 0.2);
}

.ultimate-theme .btn-container {
  border-top-color: rgba(255, 215, 0, 0.2);
  border-bottom-color: rgba(255, 215, 0, 0.2);
}

/* Features */
.features {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  text-align: left;
}

.features li {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.5;
}

.check {
  color: #64748b;
  flex: 0 0 auto;
  margin-top: 2px;
}

.cross {
  color: #444;
  flex: 0 0 auto;
  margin-top: 2px;
}

.feature-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: left;
  display: block;
}

.features li.disabled {
  color: #475569;
  text-decoration: line-through;
}

.features li.tier-standard {
  color: #a78bfa;
}

.features li.tier-standard .check {
  color: #a78bfa;
}

.features li.tier-pro {
  color: #10b981;
}

.features li.tier-pro .check {
  color: #10b981;
}

.features li.tier-ultimate {
  color: #ffd700;
}

.features li.tier-ultimate .check {
  color: #ffd700;
}

/* Buttons */
.buy-btn {
  width: 100%;
  height: 56px;
  padding: 0 14px;
  background: transparent;
  border: 1px solid #444;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: var(--common-font);
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.buy-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.buy-btn:disabled:hover {
  border-color: #444;
  background: transparent;
}

.pro-theme .buy-btn.primary:disabled:hover {
  background: #064e3b;
  border-color: #064e3b;
  color: #10b981;
  box-shadow: none;
}

.ultimate-theme .buy-btn.gold:disabled:hover {
  background: #ffd700;
  border-color: #ffd700;
  color: #000;
  box-shadow: none;
}

.buy-btn:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

/* Pro Theme Overrides */
.pro-theme {
  border-color: rgba(16, 185, 129, 0.6);
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
}

.pro-theme:hover {
  border-color: #10b981;
  box-shadow: 0 20px 40px rgba(16, 185, 129, 0.2);
}

.pro-theme .icon {
  color: #10b981;
}

.pro-theme .buy-btn.primary {
  background: #064e3b;
  border-color: #064e3b;
  color: #10b981;
}

.pro-theme .buy-btn.primary:hover {
  background: #10b981;
  color: #000;
}

/* Ultimate Theme Overrides */
.ultimate-theme {
  border-color: rgba(255, 215, 0, 0.6);
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.1);
}

.ultimate-theme:hover {
  border-color: #ffd700;
  box-shadow: 0 20px 40px rgba(255, 215, 0, 0.2);
}

.ultimate-theme .icon {
  color: #ffd700;
}

.ultimate-theme .buy-btn.gold {
  background: #ffd700;
  border-color: #ffd700;
  color: #000;
}

.ultimate-theme .buy-btn.gold:hover {
  background: #ffe44d;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
}

/* Recommended Tags */
.tag-recommend {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #064e3b;
  color: #10b981;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #10b981;
}

.tag-recommend.gold {
  background: #713f12;
  color: #ffd700;
  border-color: #ffd700;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    margin-top: 40px;
    margin-bottom: 40px;
    row-gap: 16px;
  }

  .page-title {
    font-size: 40px;
  }

  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

.pay-modal {
  position: fixed;
  inset: 0;
  z-index: 20010;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.pay-panel {
  width: min(520px, 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(12, 12, 12, 0.92);
  box-shadow:
    0 0 50px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  color: #f1f5f9;
}

.pay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0 16px;
}

.pay-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: -0.5px;
}

.pay-close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.pay-close:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.pay-body {
  padding: 16px;
}

.pay-sub {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 16px;
  font-family: var(--common-font);
}

.pay-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.pay-value {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.pay-label {
  font-family: var(--common-font);
  font-size: 12px;
  color: #94a3b8;
}

.pay-mono {
  font-family: var(--common-font);
  font-size: 12px;
  color: rgba(241, 245, 249, 0.92);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.pay-copy {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  flex: 0 0 auto;
}

.pay-copy:hover {
  border-color: rgba(204, 255, 0, 0.5);
  color: rgba(204, 255, 0, 0.95);
}

.pay-copy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pay-copy:disabled:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(241, 245, 249, 0.92);
}

.pay-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.pay-hint {
  margin-top: 14px;
  font-size: 12px;
  color: #64748b;
  font-family: var(--common-font);
}

.pay-hint.ok {
  color: rgba(204, 255, 0, 0.95);
}

.pay-hint.error {
  color: #fca5a5;
}

/* New Styles */
.save-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.save-badge.gold {
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border-color: rgba(255, 215, 0, 0.3);
}
</style>
