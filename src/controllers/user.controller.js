import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const cookieOptions = {
    httpOnly: true,
    secure: true
}

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token.")
    }
}


const registerUser = asyncHandler( async (req, res) => {
    // get user details from frontend 
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check user creation
    // return response

    const {username, fullName, email, password} = req.body;
    if (
        [fullName, email, username, password].some((field) => field?.trim() == "")
    ) {
        throw new ApiError(400, "All fields are required!");
    }
    const existedUser = await User.findOne({
        $or: [{ username: username?.toLowerCase() }, { email: email?.toLowerCase() }]
    })
    if(existedUser) {
        throw new ApiError(409, "User with username or email already exists!")
    }
    console.log(req.files);
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath="";
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if( !avatarLocalPath ) {
        throw new ApiError(400, "Avatar is required!");
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if( !avatar ) {
        throw new ApiError(400, "Avatar is required!")
    }
    const user = await User.create({
        username: username.toLowerCase(),
        fullName,
        email: email.toLowerCase(),
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    })
    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if( !createdUser ) {
        throw new ApiError(500, "Something went wrong while registering the user!")
    }
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully!")
    )
})

const loginUser = asyncHandler( async (req, res) => {

    // req body -> data
    // username or email
    // find the user
    // password check
    // access and refresh token
    // send cookie

    const {email, username, password} = req.body;
    if(!(username || email)) {
        throw new ApiError(400, "Username or email is required!")
    }
    const user = await User.findOne({
        $or: [{username: username?.toLowerCase()}, {email: email?.toLowerCase()}],
    });
    if(!user) {
        throw new ApiError(404, "User does not exist!")
    }
    const isValidPassword = await user.isPasswordCorrect(password)
    if( !isValidPassword ) {
        throw new ApiError(401, "Invalid user credentials!");
    }
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
        new ApiResponse(
        200,
        {
            user: loggedInUser, 
            accessToken,
            refreshToken
        },
        "User logged in successfully!"
    )
    )
})

const logoutUser = asyncHandler(async (req, res) => {
    // remove refresh token from db
    // remove cookie
    // send response
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {refreshToken: ""}
        }
    );
    return res.status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200,{}, "User logged out successfully!"))
})

const refreshAccessToken = asyncHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if( !incomingRefreshToken ) {
        throw new ApiError(401, "Unauthorized request");
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id).select("-password");
        if(!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
        if(incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }
        const { refreshToken, accessToken } = await generateAccessAndRefreshTokens(user._id);
        return res.status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(new ApiResponse(
            200,
            {
                accessToken,
                refreshToken
            },
            "Access token refreshed!"
        ))
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler( async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req?.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    if( !isPasswordCorrect ) {
        throw new ApiError(400, "Invalid old password")
    }
    user.password = newPassword;
    await user.save({validateBeforeSave: false});
    return res.status(200)
    .json( new ApiResponse(
        200,
        {},
        "Password changed successfully!"
    ) )
})

const getCurrentUser = asyncHandler( async (req, res) => {
    return res.status(200)
    .json( new ApiResponse(200, req.user, "Current user fetched successfully!") );
})

const updateAccountDetails = asyncHandler( async (req, res) => {
    const { fullName, email } = req.body;
    if(!fullName || !email) {
        throw new ApiError(400, "All fields are required");
    }
    await User.findByIdAndUpdate(
        req?.user._id,
        {
            $set: {
                fullName,
                email,
            }
        }
    )

    return res.status(200)
    .json( new ApiResponse(
        200,
        {},
        "Account details updated successfully!"
    ))
})

const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.files?.avatar[0]?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if(!avatar.url) {
        throw new ApiError(400, "Avatar upload failed");
    }
    const user = await User.findByIdAndUpdate(
        req?.user._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {
            new: true
        }
    )

    return res.status(200)
    .json(new ApiResponse(
        200,
        {user},
        "Avatar Image updated successfully"
    ))
})

const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover Image file is missing");
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImage.url) {
        throw new ApiError(400, "Cover Image upload failed");
    }
    const user = await User.findByIdAndUpdate(
        req?.user._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {
            new: true
        }
    )

    return res.status(200)
    .json(new ApiResponse(
        200,
        {user},
        "Cover Image updated successfully"
    ))
})

export { 
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage
}