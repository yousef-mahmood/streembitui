define(
    [
        'jquery',
        'knockout',
        './router',
        'datasrvc',
        'appsrvc',
        'accountsrvc',
        'bootstrap',
        'i18next',
        'localsrvc'
    ],
    function ($, ko, router, datasrvc, appsrvc, accountsrvc,bootstrap, i18n, localsrvc) {
        // Components can be packaged as AMD modules, such as the following:
        ko.components.register('navbar', { require: 'app/components/navbar/navbar' });
        ko.components.register('contacts-bar', { require: 'app/components/contacts-bar/contacts-bar' });
        ko.components.register('initui', { require: 'app/components/initui/initui' });
        ko.components.register('connect-to-public', { require: 'app/components/connect-to-public/connect-to-public' });

        // ... or for template-only components, you can just point to a .html file directly:
        ko.components.register('about', {
            template: { require: 'text!components/about/about.html' }
        });

        //debugger;
        // initialize the local resource files

        ko.applyBindings({ route: router.currentRoute, appsrvc: appsrvc, accountsrvc: accountsrvc });

    }
);
