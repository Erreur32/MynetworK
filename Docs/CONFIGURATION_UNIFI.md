# UniFi Controller Configuration for MynetworK

This guide explains how to configure the UniFi plugin in MynetworK to access your local UniFi controller.

**📖 [Lire en français](CONFIGURATION_UNIFI.fr.md)**

---

## 📋 Table of contents

1. [Prerequisites](#prerequisites)
2. [Creating a local UniFi user (IMPORTANT)](#creating-a-local-unifi-user-important)
3. [Configuring the plugin in MynetworK](#configuring-the-plugin-in-mynetwork)
4. [Connection test](#connection-test)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- ✅ A UniFi controller accessible on your local network
- ✅ Administrator rights on the UniFi controller
- ✅ The full controller URL (e.g. `https://192.168.1.100:8443`)
- ✅ The UniFi site name (usually `default`)

---

## Creating a local UniFi user (IMPORTANT)

### ⚠️ Why use a local user?

**Using a LOCAL user account instead of a UniFi cloud account is strongly recommended** for the following reasons:

- ✅ **No 2FA issues**: Cloud accounts may require two-factor authentication, which can block API access
- ✅ **More reliable**: Local accounts work directly with the controller API without depending on cloud services
- ✅ **Better security**: You keep full control over credentials without relying on an external service
- ✅ **Compatibility**: The local API is more stable and better documented

### 📝 Steps to create a local user

1. **Access your UniFi controller**
   - Open your browser and log in to the controller web interface
   - Typical URL: `https://192.168.1.XXX:8443` or `https://unifi.example.com:8443`

2. **Open administration settings**
   - Click the **Settings** (⚙️) icon at the bottom left
   - In the left menu, select **Administration**

3. **Create a new user**
   - Click the **Administrators** (or **Users**) tab
   - Click **+ Add Administrator** (or **+ Add Administrator**)

4. **Configure the user**
   - **Username**: Choose a simple name (e.g. `mynetwork`, `api-user`, `dashboard`)
   - **Email**: Optional but recommended for notifications
   - **Password**: Create a strong, secure password
   - **Role**: Select **Full Administrator** (or **Super Admin** depending on version)
   - **Account type**: ⚠️ **IMPORTANT**: Ensure the type is **Local** (not **Cloud** or **SSO**)
   - **Two-factor authentication**: Disable it for this user (or configure it if needed)

5. **Check permissions**
   - Ensure the user has the following permissions:
     - ✅ Read devices
     - ✅ Read clients
     - ✅ Read Wi‑Fi networks (WLANs)
     - ✅ Read statistics
   - With the **Full Administrator** role, these are usually all included

6. **Save and test**
   - Click **Add** (or **Save**)
   - Test logging in to the controller web interface with these credentials to confirm they work

### 🔒 Security best practices

- Use a strong, unique password for this user
- Do not share these credentials with other applications
- Revoke this user if you stop using it
- Consider creating a dedicated user only for MynetworK (principle of least privilege)

---

## Configuring the plugin in MynetworK

### 1. Open configuration

1. Log in to MynetworK
2. Click the **Settings** (⚙️) icon in the header
3. In the left menu, select **Administration**
4. Click the **Plugins** tab
5. Find the **UniFi Controller** card in the list
6. Click the **Settings** (⚙️) icon on the UniFi card

### 2. Fill in the configuration form

The configuration modal opens. Fill in the following fields:

#### Connection mode

Select **Local Controller (URL/User/Pass)** to use a local controller.

> 💡 **Note**: **Site Manager API** mode is available for UniFi Cloud users but requires an API key. This guide focuses on Local Controller mode.

#### UniFi Controller URL

- **Format**: `https://IP_OR_DOMAIN:PORT`
- **Examples**:
  - `https://192.168.1.100:8443`
  - `https://unifi.example.com:8443`
  - `https://192.168.1.50:8443`

⚠️ **Important**:
- Always include the protocol (`https://`)
- Always include the port (usually `8443` for HTTPS)
- Use the controller’s IP address or full domain name

#### Username

- Enter the username of the local user you created above
- Example: `mynetwork`, `api-user`, `admin`

#### Password

- Enter the local user’s password
- You can click the 👁️ icon to show/hide the password

#### UniFi site

- **Default value**: `default`
- If you have multiple sites in your controller, enter the exact site name
- To find your site name:
  1. Log in to the controller web interface
  2. The site name is usually shown at the top left
  3. Or go to **Settings** → **Sites** to see the list

### 3. Test the connection

Before saving, **always test the connection**:

1. Click the **Test connection** button (🔄 icon)
2. Wait a few seconds
3. If the test succeeds:
   - ✅ A green “Connection test successful” message appears
   - You can then save the configuration
4. If the test fails:
   - ❌ A red message with error details appears
   - See the [Troubleshooting](#troubleshooting) section below

### 4. Save the configuration

1. If the connection test succeeded, click **Save**
2. The modal closes automatically
3. The UniFi card in the plugin list should now show **Connected** (green badge)
4. You can enable the plugin by toggling the **Active** switch

---

## Connection test

### Check connection status

After configuring the plugin, you can check the connection status:

1. **In the plugin list**:
   - Green **Connected** badge: Plugin is correctly configured and connected
   - Yellow **Not connected** badge: Plugin is enabled but connection failed
   - Grey **Disabled** badge: Plugin is not enabled

2. **On the UniFi page**:
   - If the plugin is connected, you can open the UniFi page from the dashboard
   - Device, client, and Wi‑Fi network data should be displayed

### Manually test the connection

You can test the connection again at any time:

1. Go to **Settings** → **Administration** → **Plugins**
2. Click the **🔄 Test** icon on the UniFi card
3. The connection status will be updated

---

## Troubleshooting

### ❌ Error: "Login failed" or "Connection failed"

**Possible causes:**

1. **Incorrect credentials**
   - ✅ Check username and password
   - ✅ Test logging in to the controller web interface with the same credentials

2. **Cloud user instead of local**
   - ✅ In the controller settings, confirm the user type is **Local**
   - ✅ Create a new local user if needed

3. **2FA enabled**
   - ✅ Disable two-factor authentication for this user
   - ✅ Or create a new user without 2FA

4. **Incorrect URL**
   - ✅ Ensure the URL includes `https://` and port `:8443`
   - ✅ Try the URL in your browser to confirm it is reachable

### ❌ Error: "Network error" or "Unable to reach server"

**Possible causes:**

1. **Controller unreachable**
   - ✅ Ensure the controller is running and reachable
   - ✅ Test the URL in your browser
   - ✅ Check firewall rules if MynetworK runs in Docker

2. **Network issue**
   - ✅ If MynetworK is in Docker, ensure the container can reach the local network
   - ✅ Ensure the controller and MynetworK are on the same network

3. **Self-signed SSL certificate**
   - ✅ Self-signed certificates can cause issues
   - ✅ Consider using a valid certificate or configuring the controller to accept self-signed certs

### ❌ Error: "Site not found" or "Invalid site"

**Possible causes:**

1. **Wrong site name**
   - ✅ Check the exact site name in the controller web interface
   - ✅ Names are case-sensitive
   - ✅ Use `default` if unsure

2. **Site deleted**
   - ✅ Confirm the site still exists in the controller
   - ✅ Create a new site if needed

### ❌ Error: "Permission denied" or "Access denied"

**Possible causes:**

1. **Insufficient permissions**
   - ✅ Ensure the user has the **Full Administrator** role
   - ✅ Check permissions in the controller settings

2. **Restricted user**
   - ✅ Limited-permission users may not have access to all features
   - ✅ Use a user with full permissions

### ❌ Plugin shows "Not connected" after configuration

**Steps to try:**

1. **Check logs**
   - Check MynetworK server logs for detailed errors
   - Logs can show the exact cause

2. **Test again**
   - Click **Test connection** again
   - A simple retest sometimes fixes temporary issues

3. **Check configuration**
   - Open the configuration modal again
   - Ensure all fields are correct
   - Save the configuration again

4. **Restart the plugin**
   - Disable the plugin (**Active** switch)
   - Wait a few seconds
   - Enable the plugin again

### 🔍 Further checks

If problems continue, verify:

- ✅ **UniFi controller version**: Some versions may have compatibility issues
- ✅ **MynetworK version**: Use a recent release
- ✅ **Controller logs**: Check UniFi controller logs for server-side errors
- ✅ **Network connectivity**: Use `ping` or `curl` to test connectivity between MynetworK and the controller

---

## 📚 Additional resources

### Official UniFi documentation

- [UniFi Controller API Documentation](https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API)
- [UniFi Network Application](https://help.ui.com/hc/en-us/categories/360000024273-UniFi-Network-Application)

### Support

If you still have issues after following this guide:

1. Check MynetworK server logs
2. Check the project documentation on GitHub
3. Open an issue on the GitHub repository with details of your problem

---

## ✅ Configuration checklist

Before considering configuration complete, verify:

- [ ] A local user was created in the UniFi controller
- [ ] The user has the Full Administrator role
- [ ] The user type is Local (not Cloud)
- [ ] 2FA is disabled for this user (or configured correctly)
- [ ] The controller URL is correct (with `https://` and port)
- [ ] Username and password are correct
- [ ] The site name is correct (or `default`)
- [ ] The connection test succeeds
- [ ] Configuration is saved
- [ ] The plugin is enabled
- [ ] Status shows "Connected"
- [ ] UniFi data appears on the UniFi page

---

**Last updated**: Version 0.1.12
